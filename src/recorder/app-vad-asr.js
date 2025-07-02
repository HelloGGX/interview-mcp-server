// This file copies and modifies code
// DOM元素引用
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const soundClips = document.getElementById('sound-clips');
const textArea = document.getElementById('results');

// 语音识别结果管理
let lastResult = '';
let resultList = [];

// 清除按钮事件处理
clearBtn.onclick = function() {
  resultList = [];
  textArea.value = getDisplayResult();
  textArea.scrollTop = textArea.scrollHeight;  // 自动滚动到底部
};

/**
 * 格式化并返回显示结果
 * @returns {string} 格式化的结果字符串
 */
function getDisplayResult() {
  let i = 0;
  let ans = '';
  
  for (let s in resultList) {
    if (resultList[s] === '') {
      continue;
    }

    if (resultList[s] === 'Speech detected') {
      ans += '' + i + ': ' + resultList[s];
      i += 1;
    } else {
      ans += ', ' + resultList[s] + '\n';
    }
  }

  if (lastResult.length > 0) {
    ans += '' + i + ': ' + lastResult + '\n';
  }
  return ans;
}

// 全局声明 - WebAssembly模块对象，由sherpa-onnx库提供
/* global Module, OfflineRecognizer, createVad, CircularBuffer */

// 音频处理相关变量
let audioCtx;
let mediaStream;
let expectedSampleRate = 16000;
let recordSampleRate;  // 麦克风的采样率
let recorder = null;   // 麦克风录音器

// 语音处理相关变量
let vad = null;        // 语音活动检测器
let buffer = null;     // 循环缓冲区
let recognizer = null; // 离线识别器
let printed = false;   // 是否已打印语音检测状态

/**
 * 检查文件是否存在
 * @param {string} filename - 文件名
 * @returns {number} 1表示存在，0表示不存在
 */
function fileExists(filename) {
  const filenameLen = Module.lengthBytesUTF8(filename) + 1;
  const buffer = Module._malloc(filenameLen);
  Module.stringToUTF8(filename, buffer, filenameLen);

  let exists = Module._SherpaOnnxFileExists(buffer);

  Module._free(buffer);

  return exists;
}

/**
 * 初始化离线语音识别器
 * 根据可用的模型文件自动选择合适的配置
 */
function initOfflineRecognizer() {
  let config = {
    modelConfig: {
      debug: 1,
      tokens: './tokens.txt',
    },
  };

  // 按优先级检查可用的模型文件并配置相应的识别器
  if (fileExists('sense-voice.onnx') === 1) {
    config.modelConfig.senseVoice = {
      model: './sense-voice.onnx',
      useInverseTextNormalization: 1,
    };
  } else if (fileExists('whisper-encoder.onnx')) {
    config.modelConfig.whisper = {
      encoder: './whisper-encoder.onnx',
      decoder: './whisper-decoder.onnx',
    };
  } else if (fileExists('transducer-encoder.onnx')) {
    config.modelConfig.transducer = {
      encoder: './transducer-encoder.onnx',
      decoder: './transducer-decoder.onnx',
      joiner: './transducer-joiner.onnx',
    };
    config.modelConfig.modelType = 'transducer';
  } else if (fileExists('nemo-transducer-encoder.onnx')) {
    config.modelConfig.transducer = {
      encoder: './nemo-transducer-encoder.onnx',
      decoder: './nemo-transducer-decoder.onnx',
      joiner: './nemo-transducer-joiner.onnx',
    };
    config.modelConfig.modelType = 'nemo_transducer';
  } else if (fileExists('paraformer.onnx')) {
    config.modelConfig.paraformer = {
      model: './paraformer.onnx',
    };
  } else if (fileExists('telespeech.onnx')) {
    config.modelConfig.telespeechCtc = './telespeech.onnx';
  } else if (fileExists('moonshine-preprocessor.onnx')) {
    config.modelConfig.moonshine = {
      preprocessor: './moonshine-preprocessor.onnx',
      encoder: './moonshine-encoder.onnx',
      uncachedDecoder: './moonshine-uncached-decoder.onnx',
      cachedDecoder: './moonshine-cached-decoder.onnx'
    };
  } else if (fileExists('dolphin.onnx')) {
    config.modelConfig.dolphin = {model: './dolphin.onnx'};
  } else {
    console.log('Please specify a model.');
    alert('Please specify a model.');
    return;
  }

  recognizer = new OfflineRecognizer(config, Module);
}

// WebAssembly模块配置
// 定位文件路径的回调函数
Module.locateFile = function(path, scriptDirectory = '') {
  console.log(`path: ${path}, scriptDirectory: ${scriptDirectory}`);
  return scriptDirectory + path;
};

// 设置加载状态的回调函数
Module.setStatus = function(status) {
  console.log(`status ${status}`);
  const statusElement = document.getElementById('status');
  
  if (status === 'Running...') {
    status = 'Model downloaded. Initializing recognizer...';
  }
  
  statusElement.textContent = status;
  
  if (status === '') {
    statusElement.style.display = 'none';
    document.querySelectorAll('.tab-content').forEach((tabContentElement) => {
      tabContentElement.classList.remove('loading');
    });
  } else {
    statusElement.style.display = 'block';
    document.querySelectorAll('.tab-content').forEach((tabContentElement) => {
      tabContentElement.classList.add('loading');
    });
  }
};

// WebAssembly运行时初始化完成后的回调
Module.onRuntimeInitialized = function() {
  console.log('WebAssembly runtime initialized!');

  startBtn.disabled = false;

  // 初始化语音活动检测器
  vad = createVad(Module);
  console.log('VAD (Voice Activity Detector) created!', vad);

  // 初始化循环缓冲区 (30秒的16kHz音频)
  buffer = new CircularBuffer(30 * 16000, Module);
  console.log('CircularBuffer created!', buffer);

  // 初始化离线识别器
  initOfflineRecognizer();
};

/**
 * 处理音频数据的主函数
 * @param {AudioProcessingEvent} e - 音频处理事件
 */
function processAudioData(e) {
  // 获取音频样本并降采样
  let samples = new Float32Array(e.inputBuffer.getChannelData(0));
  samples = downsampleBuffer(samples, expectedSampleRate);
  buffer.push(samples);

  // 处理VAD检测
  while (buffer.size() > vad.config.sileroVad.windowSize) {
    const segment = buffer.get(buffer.head(), vad.config.sileroVad.windowSize);
    vad.acceptWaveform(segment);
    buffer.pop(vad.config.sileroVad.windowSize);

    // 语音检测状态管理
    if (vad.isDetected() && !printed) {
      printed = true;
      lastResult = 'Speech detected';
    }

    if (!vad.isDetected()) {
      printed = false;
      if (lastResult !== '') {
        resultList.push(lastResult);
      }
      lastResult = '';
    }

    // 处理检测到的语音段
    processDetectedSpeech();
  }

  // 更新显示结果
  textArea.value = getDisplayResult();
  textArea.scrollTop = textArea.scrollHeight;  // 自动滚动
}

/**
 * 处理检测到的语音段
 */
function processDetectedSpeech() {
  while (!vad.isEmpty()) {
    const segment = vad.front();
    const duration = segment.samples.length / expectedSampleRate;
    let durationStr = `Duration: ${duration.toFixed(3)} seconds`;
    vad.pop();

    // 执行语音识别
    const recognitionResult = performSpeechRecognition(segment);
    
    if (recognitionResult !== '') {
      durationStr += `. Result: ${recognitionResult}`;
    }

    resultList.push(durationStr);

    // 创建音频剪辑
    createAudioClip(segment, durationStr);
  }
}

/**
 * 执行语音识别
 * @param {Object} segment - 音频段对象
 * @returns {string} 识别结果文本
 */
function performSpeechRecognition(segment) {
  const stream = recognizer.createStream();
  stream.acceptWaveform(expectedSampleRate, segment.samples);
  recognizer.decode(stream);
  const recognitionResult = recognizer.getResult(stream);
  console.log(recognitionResult);
  const text = recognitionResult.text;
  stream.free();
  console.log('Recognition result:', text);
  return text;
}

/**
 * 创建音频剪辑UI元素
 * @param {Object} segment - 音频段对象
 * @param {string} durationStr - 持续时间描述字符串
 */
function createAudioClip(segment, durationStr) {
  // 将Float32Array转换为Int16Array (PCM格式)
  const buf = new Int16Array(segment.samples.length);
  for (let i = 0; i < segment.samples.length; ++i) {
    let s = segment.samples[i];
    // 限制范围在[-1, 1]
    if (s >= 1) s = 1;
    else if (s <= -1) s = -1;
    // 转换为16位PCM
    buf[i] = s * 32767;
  }

  // 生成剪辑名称
  const clipName = new Date().toISOString() + '--' + durationStr;

  // 创建DOM元素
  const clipContainer = document.createElement('article');
  const clipLabel = document.createElement('p');
  const audio = document.createElement('audio');
  const deleteButton = document.createElement('button');

  // 设置样式和属性
  clipContainer.classList.add('clip');
  audio.setAttribute('controls', '');
  deleteButton.textContent = 'Delete';
  deleteButton.className = 'delete';
  clipLabel.textContent = clipName;

  // 组装DOM结构
  clipContainer.appendChild(audio);
  clipContainer.appendChild(clipLabel);
  clipContainer.appendChild(deleteButton);
  soundClips.appendChild(clipContainer);

  // 设置音频源
  audio.controls = true;
  const blob = toWav(buf);
  const audioURL = window.URL.createObjectURL(blob);
  audio.src = audioURL;

  // 删除按钮事件
  deleteButton.onclick = function(e) {
    const evtTgt = e.target;
    evtTgt.parentNode.parentNode.removeChild(evtTgt.parentNode);
  };

  // 重命名功能
  clipLabel.onclick = function() {
    const existingName = clipLabel.textContent;
    const newClipName = prompt('Enter a new name for your sound clip?');
    if (newClipName === null) {
      clipLabel.textContent = existingName;
    } else {
      clipLabel.textContent = newClipName;
    }
  };
}

// 检查浏览器是否支持getUserMedia
if (navigator.mediaDevices.getUserMedia) {
  console.log('getUserMedia supported.');

  // 音频约束配置
  const constraints = {audio: true};

  /**
   * 成功获取媒体流后的处理函数
   * @param {MediaStream} stream - 媒体流对象
   */
  const onSuccess = function(stream) {
    // 初始化音频上下文
    if (!audioCtx) {
      audioCtx = new AudioContext({sampleRate: expectedSampleRate});
    }
    console.log('Audio context:', audioCtx);
    recordSampleRate = audioCtx.sampleRate;
    console.log('Sample rate:', recordSampleRate);

    // 创建媒体流源节点
    mediaStream = audioCtx.createMediaStreamSource(stream);
    console.log('Media stream source created:', mediaStream);

    // 创建音频处理器节点
    const bufferSize = 4096;
    const numberOfInputChannels = 1;
    const numberOfOutputChannels = 2;
    
    if (audioCtx.createScriptProcessor) {
      recorder = audioCtx.createScriptProcessor(
          bufferSize, numberOfInputChannels, numberOfOutputChannels);
    } else {
      recorder = audioCtx.createJavaScriptNode(
          bufferSize, numberOfInputChannels, numberOfOutputChannels);
    }
    console.log('Audio recorder created:', recorder);

    // 设置音频处理回调
    recorder.onaudioprocess = processAudioData;

    // 开始录音按钮事件
    startBtn.onclick = function() {
      mediaStream.connect(recorder);
      recorder.connect(audioCtx.destination);

      console.log('Recording started');

      stopBtn.disabled = false;
      startBtn.disabled = true;
    };

    // 停止录音按钮事件
    stopBtn.onclick = function() {
      vad.reset();
      buffer.reset();
      console.log('Recording stopped');

      // 断开音频连接
      recorder.disconnect(audioCtx.destination);
      mediaStream.disconnect(recorder);

      // 重置按钮样式
      startBtn.style.background = '';
      startBtn.style.color = '';

      // 更新按钮状态
      stopBtn.disabled = true;
      startBtn.disabled = false;
    };
  };

  /**
   * 获取媒体流失败后的错误处理函数
   * @param {Error} err - 错误对象
   */
  const onError = function(err) {
    console.log('The following error occurred: ' + err);
  };

  // 请求用户媒体权限
  navigator.mediaDevices.getUserMedia(constraints).then(onSuccess, onError);
} else {
  console.log('getUserMedia not supported on your browser!');
  alert('getUserMedia not supported on your browser!');
}

/**
 * 将PCM样本数据转换为WAV格式的Blob
 * @param {Int16Array} samples - PCM样本数据
 * @returns {Blob} WAV格式的音频Blob
 */
function toWav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);

  // WAV文件头格式 (http://soundfile.sapp.org/doc/WaveFormat/)
  view.setUint32(0, 0x46464952, true);               // "RIFF"
  view.setUint32(4, 36 + samples.length * 2, true);  // 文件大小
  view.setUint32(8, 0x45564157, true);               // "WAVE"
  view.setUint32(12, 0x20746d66, true);              // "fmt "
  view.setUint32(16, 16, true);                      // PCM格式块大小
  view.setUint32(20, 1, true);                       // 音频格式 (PCM = 1)
  view.setUint16(22, 1, true);                       // 声道数
  view.setUint32(24, expectedSampleRate, true);      // 采样率
  view.setUint32(28, expectedSampleRate * 2, true);  // 字节率
  view.setUint16(32, 2, true);                       // 块对齐
  view.setUint16(34, 16, true);                      // 位深度
  view.setUint32(36, 0x61746164, true);              // "data"
  view.setUint32(40, samples.length * 2, true);      // 数据大小

  // 写入音频数据
  let offset = 44;
  for (let i = 0; i < samples.length; ++i) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return new Blob([view], {type: 'audio/wav'});
}

/**
 * 降采样缓冲区数据
 * @param {Float32Array} buffer - 原始音频缓冲区
 * @param {number} exportSampleRate - 目标采样率
 * @returns {Float32Array} 降采样后的音频数据
 */
function downsampleBuffer(buffer, exportSampleRate) {
  if (exportSampleRate === recordSampleRate) {
    return buffer;
  }
  
  const sampleRateRatio = recordSampleRate / exportSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    
    result[offsetResult] = accum / count;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  
  return result;
}
