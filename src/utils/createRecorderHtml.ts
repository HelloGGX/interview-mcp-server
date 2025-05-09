import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const HTML_DIR = path.join(process.cwd(), "public");
const HTML_FILE = path.join(HTML_DIR, "recorder.html");
const RECORDINGS_DIR = path.join(process.cwd(), "recordings");

// 创建录音HTML页面
export const createRecorderHTML = (name: string) => {
  // 确保目录存在
  if (!fs.existsSync(RECORDINGS_DIR)) {
    fs.mkdirSync(RECORDINGS_DIR, { recursive: true });
  }

  // 创建name对应的文件夹
  const recordingFolder = path.join(RECORDINGS_DIR, name || "default");
  if (!fs.existsSync(recordingFolder)) {
    fs.mkdirSync(recordingFolder, { recursive: true });
  }

  if (!fs.existsSync(HTML_DIR)) {
    fs.mkdirSync(HTML_DIR, { recursive: true });
  }

  // 生成会话ID和录音文件名
  const sessionId = uuidv4();
  const fileName = `interview_${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const filePath = path.join(recordingFolder, `${fileName}.wav`);

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>面试录音</title>
  <style>
    body {
      font-family: 'Arial', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      text-align: center;
      margin-bottom: 30px;
    }
    .controls {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-bottom: 30px;
    }
    button {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      transition: all 0.3s;
    }
    .start-btn {
      background-color: #4CAF50;
      color: white;
    }
    .pause-btn {
      background-color: #FFC107;
      color: black;
    }
    .stop-btn {
      background-color: #F44336;
      color: white;
    }
    button:hover {
      opacity: 0.8;
    }
    button:disabled {
      background-color: #cccccc;
      cursor: not-allowed;
      opacity: 0.6;
    }
    .timer {
      font-size: 24px;
      text-align: center;
      margin-bottom: 20px;
    }
    .visualizer {
      width: 100%;
      height: 100px;
      background-color: #f0f0f0;
      margin-bottom: 20px;
      border-radius: 4px;
    }
    .status {
      text-align: center;
      font-size: 18px;
      margin-top: 20px;
      color: #555;
    }
    .session-id {
      display: none;
    }
    .folder-name {
      display: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>面试录音系统</h1>
      <p>录制面试对话，自动保存到指定文件夹</p>
    </div>
    
    <div class="timer" id="timer">00:00:00</div>
    
    <canvas id="visualizer" class="visualizer"></canvas>
    
    <div class="controls">
      <button id="startBtn" class="start-btn">开始录音</button>
      <button id="pauseBtn" class="pause-btn" disabled>暂停录音</button>
      <button id="stopBtn" class="stop-btn" disabled>结束录音</button>
    </div>
    
    <div class="status" id="status">准备就绪，正在自动开始录音...</div>
    <div class="session-id" id="session-id">${sessionId}</div>
    <div class="folder-name" id="folder-name">${name || "default"}</div>
  </div>

  <script>
    let mediaRecorder;
    let audioChunks = [];
    let startTime;
    let timerInterval;
    let audioContext;
    let analyser;
    let isPaused = false;
    let sessionId = document.getElementById('session-id').textContent;
    let folderName = document.getElementById('folder-name').textContent;
    
    const startBtn = document.getElementById('startBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const timerElement = document.getElementById('timer');
    const statusElement = document.getElementById('status');
    const canvas = document.getElementById('visualizer');
    const canvasCtx = canvas.getContext('2d');
    
    // 设置canvas尺寸
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    
    // 页面加载完成后自动开始录音
    window.addEventListener('DOMContentLoaded', async () => {
      // 自动点击开始录音按钮
      startRecording();
    });
    
    // 开始录音函数
    async function startRecording() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 设置音频可视化
        setupAudioVisualizer(stream);
        
        // 设置录音机
        mediaRecorder = new MediaRecorder(stream);
        
        mediaRecorder.ondataavailable = (event) => {
          audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
          saveRecording(audioBlob);
        };
        
        // 开始录音
        audioChunks = [];
        mediaRecorder.start();
        startTime = new Date();
        
        // 开始计时器
        timerInterval = setInterval(updateTimer, 1000);
        
        // 更新UI
        startBtn.disabled = true;
        pauseBtn.disabled = false;
        stopBtn.disabled = false;
        statusElement.textContent = '正在录音...';
        
      } catch (error) {
        console.error('获取麦克风权限失败:', error);
        statusElement.textContent = '错误: 无法访问麦克风';
      }
    }
    
    // 开始录音按钮点击事件
    startBtn.addEventListener('click', startRecording);
    
    // 暂停/继续录音
    pauseBtn.addEventListener('click', () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        pauseBtn.textContent = '继续录音';
        statusElement.textContent = '录音已暂停';
        isPaused = true;
        clearInterval(timerInterval);
      } else if (mediaRecorder && mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        pauseBtn.textContent = '暂停录音';
        statusElement.textContent = '正在录音...';
        isPaused = false;
        timerInterval = setInterval(updateTimer, 1000);
      }
    });
    
    // 停止录音
    stopBtn.addEventListener('click', () => {
      if (mediaRecorder) {
        mediaRecorder.stop();
        clearInterval(timerInterval);
        
        // 更新UI
        startBtn.disabled = false;
        pauseBtn.disabled = true;
        stopBtn.disabled = true;
        pauseBtn.textContent = '暂停录音';
        statusElement.textContent = '录音已完成，正在保存...';
      }
    });
    
    // 更新计时器
    function updateTimer() {
      const now = new Date();
      const diff = now - startTime;
      
      const hours = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const minutes = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const seconds = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      
      timerElement.textContent = \`\${hours}:\${minutes}:\${seconds}\`;
    }
    
    // 设置音频可视化
    function setupAudioVisualizer(stream) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      
      source.connect(analyser);
      // 不连接到destination以避免回声
      
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
      
      function draw() {
        if (!isPaused) {
          requestAnimationFrame(draw);
          
          analyser.getByteFrequencyData(dataArray);
          
          canvasCtx.fillStyle = '#f0f0f0';
          canvasCtx.fillRect(0, 0, canvas.width, canvas.height);
          
          const barWidth = (canvas.width / bufferLength) * 2.5;
          let x = 0;
          
          for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] / 2;
            
            canvasCtx.fillStyle = \`rgb(\${barHeight + 100}, 50, 50)\`;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            
            x += barWidth + 1;
          }
        } else {
          setTimeout(() => requestAnimationFrame(draw), 500);
        }
      }
      
      draw();
    }
    
    // 保存录音
    function saveRecording(audioBlob) {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.wav');
      formData.append('sessionId', sessionId);
      formData.append('folderName', folderName);
      
      fetch('/save-recording', {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          statusElement.textContent = \`录音已保存: \${data.filename}\`;
        } else {
          statusElement.textContent = '保存录音失败: ' + data.error;
        }
      })
      .catch(error => {
        console.error('保存录音出错:', error);
        statusElement.textContent = '保存录音时发生错误';
      });
    }
  </script>
</body>
</html>
  `;
  fs.writeFileSync(HTML_FILE, html);
  return {
    filePath,
    htmlPath: HTML_FILE,
  };
};
