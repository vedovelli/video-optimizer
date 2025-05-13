import React, { useEffect, useState } from "react";
const { ipcRenderer } = window.require("electron");

function App() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [optimizedFile, setOptimizedFile] = useState(null);
  const [progress, setProgress] = useState(0);
  const [sendToTelegram, setSendToTelegram] = useState(
    localStorage.getItem("sendToTelegram") === "true"
  );

  useEffect(() => {
    localStorage.setItem("sendToTelegram", sendToTelegram);
  }, [sendToTelegram]);

  useEffect(() => {
    if (file) {
      handleProcess();
    }
  }, [file]);

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "video/mp4") {
      setFile(droppedFile);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleProcess = () => {
    if (!file) return;

    setProcessing(true);
    setProgress(0);
    const outputName = file.path.replace(".mp4", "-optimized.mp4");

    ipcRenderer.send("optimize-video", {
      inputPath: file.path,
      outputName,
      sendToTelegram,
    });

    ipcRenderer.on("optimization-progress", (_, { percent }) => {
      setProgress(percent);
    });

    ipcRenderer.once(
      "optimization-complete",
      (_, { success, error, telegramSent, telegramError, filesDeleted }) => {
        setProcessing(false);
        setProgress(0);

        if (success) {
          if (filesDeleted) {
            // If files were deleted after Telegram send, reset the UI
            setFile(null);
            setOptimizedFile(null);
          } else if (!sendToTelegram) {
            // If we're not sending to Telegram, show the optimized file
            setOptimizedFile(outputName);
          }
        } else {
          setFile(null);
        }
      }
    );
  };

  const handleOpenFile = () => {
    if (optimizedFile) {
      ipcRenderer.send("open-file", optimizedFile);
      setFile(null);
      setOptimizedFile(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-800 to-gray-900 p-8 flex items-center justify-center">
      <div className="w-[600px] mx-auto bg-white rounded-xl shadow-2xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-8 text-center">
            Video Optimizer
          </h1>

          <div className="mb-6">
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="sendToTelegram"
                checked={sendToTelegram}
                onChange={(e) => setSendToTelegram(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label
                htmlFor="sendToTelegram"
                className="text-sm font-medium text-gray-700"
              >
                Send to Telegram after optimization
              </label>
            </div>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className={`
              border-3 border-dashed rounded-lg p-12
              text-center transition-all duration-200
              ${
                file
                  ? "border-green-400 bg-green-50"
                  : "border-gray-300 hover:border-blue-500 bg-gray-50"
              }
            `}
          >
            {file ? (
              <div className="space-y-4">
                <p className="text-gray-700">
                  Selected file:{" "}
                  <span className="font-medium">{file.name}</span>
                </p>
                {processing && (
                  <div className="space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                    <div className="text-sm text-gray-600">
                      {progress.toFixed(1)}% complete
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  {optimizedFile ? (
                    <button
                      onClick={handleOpenFile}
                      className="px-6 py-3 rounded-lg text-white font-medium bg-green-500 hover:bg-green-600 transition-colors duration-200"
                    >
                      Open optimized video
                    </button>
                  ) : (
                    <button
                      onClick={handleProcess}
                      disabled={processing}
                      className={`
                        px-6 py-3 rounded-lg text-white font-medium
                        transition-colors duration-200
                        ${
                          processing
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-blue-500 hover:bg-blue-600"
                        }
                      `}
                    >
                      {processing ? "Processing..." : "Process Video"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="text-5xl mb-4">📁</div>
                <p className="text-gray-600">Drag and drop an MP4 file here</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
