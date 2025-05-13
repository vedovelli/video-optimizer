import React, { useEffect, useRef, useState } from "react";

import fs from "fs";

const { ipcRenderer } = window.require("electron");

const MAX_FILES = 10;

function App() {
  const [files, setFiles] = useState([]); // [{file, progress, status, optimizedPath, error}]
  const [processing, setProcessing] = useState(false);
  const filesRef = useRef(files);

  // Keep filesRef in sync with files state
  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  // Handle drag-and-drop for multiple files
  const handleDrop = (e) => {
    e.preventDefault();
    if (processing) return;
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "video/mp4"
    );
    if (droppedFiles.length === 0) return;
    const limitedFiles = droppedFiles.slice(0, MAX_FILES);
    setFiles(
      limitedFiles.map((file) => ({
        file,
        progress: 0,
        status: "pending", // pending | processing | done | error
        optimizedPath: null,
        error: null,
      }))
    );
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Register IPC listeners once on mount
  useEffect(() => {
    const progressListener = (_, { percent, index }) => {
      setFiles((prev) => {
        const updated = [...prev];
        if (
          updated[index] &&
          updated[index].status !== "done" &&
          updated[index].status !== "error"
        ) {
          updated[index] = { ...updated[index], progress: percent };
        }
        return updated;
      });
    };
    const completeListener = (_, { success, error, index }) => {
      setFiles((prev) => {
        const updated = [...prev];
        if (!updated[index]) return updated;
        if (success) {
          updated[index] = {
            ...updated[index],
            status: "done",
            progress: 100,
            optimizedPath: updated[index].file.path.replace(
              /\.mp4$/i,
              "-optimized.mp4"
            ),
          };
        } else {
          updated[index] = {
            ...updated[index],
            status: "error",
            error: error || "Unknown error",
          };
        }
        // If all files are done or errored, stop processing
        if (updated.every((f) => f.status === "done" || f.status === "error")) {
          setProcessing(false);
        }
        return updated;
      });
    };
    ipcRenderer.on("optimization-progress", progressListener);
    ipcRenderer.on("optimization-complete", completeListener);
    return () => {
      ipcRenderer.removeListener("optimization-progress", progressListener);
      ipcRenderer.removeListener("optimization-complete", completeListener);
    };
  }, []);

  // Sequentially process files
  useEffect(() => {
    if (files.length === 0 || processing) return;
    setProcessing(true);
    // Send all files at once for sequential processing in main process
    const payload = files.map((f) => ({
      inputPath: f.file.path,
      outputName: f.file.path.replace(/\.mp4$/i, "-optimized.mp4"),
      sendToTelegram: false,
    }));
    ipcRenderer.send("optimize-video", payload);
    // eslint-disable-next-line
  }, [files]);

  const handleOpenFile = (optimizedPath) => {
    if (optimizedPath && fs.existsSync(optimizedPath)) {
      ipcRenderer.send("open-file", optimizedPath);
    }
  };

  const handleReset = () => {
    setFiles([]);
    setProcessing(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-800 to-gray-900 p-2 flex items-center justify-center">
      <div className="w-[480px] mx-auto bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="p-4">
          <h1 className="text-2xl font-bold text-gray-800 mb-4 text-center">
            Video Optimizer
          </h1>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`
              border-2 border-dashed rounded-lg p-4
              text-center transition-all duration-200
              ${
                files.length > 0
                  ? "border-green-400 bg-green-50"
                  : "border-gray-300 hover:border-blue-500 bg-gray-50"
              }
              ${processing ? "opacity-60 pointer-events-none" : ""}
            `}
          >
            {files.length === 0 ? (
              <div className="space-y-1">
                <div className="text-3xl mb-2">📁</div>
                <p className="text-gray-600 text-sm">
                  Drag and drop up to 10 MP4 files here
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <ul className="space-y-2">
                  {files.map((f, idx) => (
                    <li
                      key={f.file.path}
                      className="bg-gray-100 rounded p-2 flex flex-col"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-800 text-xs truncate max-w-[260px]">
                          {f.file.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          {f.status === "pending" && "Pending"}
                          {f.status === "processing" && "Processing..."}
                          {f.status === "done" && "Done"}
                          {f.status === "error" && (
                            <span className="text-red-500">Error</span>
                          )}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1 mb-1">
                        <div
                          className={`h-1 rounded-full transition-all duration-300 ${
                            f.status === "error"
                              ? "bg-red-400"
                              : f.status === "done"
                              ? "bg-green-500"
                              : "bg-blue-600"
                          }`}
                          style={{ width: `${f.progress || 0}%` }}
                        ></div>
                      </div>
                      {f.status === "error" && (
                        <div className="text-xs text-red-500 mb-1">
                          {f.error}
                        </div>
                      )}
                      {f.status === "done" && f.optimizedPath && (
                        <button
                          onClick={() => handleOpenFile(f.optimizedPath)}
                          className="px-2 py-1 rounded text-white font-medium bg-green-500 hover:bg-green-600 transition-colors duration-200 text-xs mt-1"
                          disabled={!fs.existsSync(f.optimizedPath)}
                        >
                          Open
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleReset}
                  disabled={processing}
                  className="mt-2 px-4 py-1 rounded-lg text-white font-medium bg-gray-400 hover:bg-gray-500 transition-colors duration-200 text-xs"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
