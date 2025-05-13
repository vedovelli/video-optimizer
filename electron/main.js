import { BrowserWindow, app, ipcMain, shell } from "electron";

// Use CommonJS require for problematic modules
import { createRequire } from "module";
// Import ffmpeg related modules
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";
import { fileURLToPath } from "url";
import fs from "fs";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In production, node_modules are in extraResources
const isDev = !app.isPackaged;

const require = createRequire(import.meta.url);

const TelegramBot = require("node-telegram-bot-api");
const ffmpeg = require("fluent-ffmpeg");

// Set ffmpeg and ffprobe paths
const ffmpegPath = isDev
  ? ffmpegStatic
  : path.join(
      process.resourcesPath,
      "app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg"
    );

const ffprobePath = isDev
  ? ffprobeStatic.path
  : path.join(
      process.resourcesPath,
      "app.asar.unpacked/node_modules/ffprobe-static/bin/darwin/arm64/ffprobe"
    );

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Telegram configuration
const TELEGRAM_BOT_TOKEN = "7964160662:AAENt0vldjl4YR5Zs2QThB0WXABB9Qi63eU";
const TELEGRAM_CHANNEL_ID = "-1002411767073";
let telegramBot = null;

app.whenReady().then(async () => {
  try {
    telegramBot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });
    await telegramBot.getChat(TELEGRAM_CHANNEL_ID);
  } catch (error) {
    console.error("Failed to initialize Telegram");
  }
  createWindow();
});

async function sendToTelegram(filePath, caption) {
  if (!telegramBot) {
    throw new Error("Telegram not configured");
  }

  try {
    const video = fs.createReadStream(filePath);
    await telegramBot.sendVideo(TELEGRAM_CHANNEL_ID, video, {
      caption: caption || "Video update",
    });
    return true;
  } catch (error) {
    throw error;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  if (!app.isPackaged) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

async function cleanupFiles(inputPath, outputPath) {
  try {
    await fs.promises.unlink(inputPath);
    await fs.promises.unlink(outputPath);
    return true;
  } catch (error) {
    return false;
  }
}

ipcMain.on(
  "optimize-video",
  (event, { inputPath, outputName, sendToTelegram: shouldSendToTelegram }) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        event.reply("optimization-complete", {
          success: false,
          error: err.message,
        });
        return;
      }

      ffmpeg(inputPath)
        .outputOptions(["-vcodec h264", "-acodec aac"])
        .on("progress", (progress) => {
          const percent = Math.round((progress.percent || 0) * 100) / 100;
          event.reply("optimization-progress", { percent });
        })
        .on("end", async () => {
          if (shouldSendToTelegram) {
            try {
              await sendToTelegram(outputName);
              const cleaned = await cleanupFiles(inputPath, outputName);
              event.reply("optimization-complete", {
                success: true,
                telegramSent: true,
                filesDeleted: cleaned,
              });
            } catch (error) {
              event.reply("optimization-complete", {
                success: true,
                telegramError: error.message,
              });
            }
          } else {
            event.reply("optimization-complete", { success: true });
          }
        })
        .on("error", (err) => {
          event.reply("optimization-complete", {
            success: false,
            error: err.message,
          });
        })
        .save(outputName);
    });
  }
);

ipcMain.on("open-file", (event, filePath) => {
  shell.openPath(filePath);
});
