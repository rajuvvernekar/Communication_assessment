'use strict';

const Recorder = (() => {
  let _mediaRecorder = null;
  let _chunks = [];
  let _stream = null;
  let _audioCtx = null;
  let _analyser = null;
  let _animId = null;
  let _timerInterval = null;
  let _timerEl = null;
  let _seconds = 0;
  let _countUp = true;

  async function requestMic() {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      return true;
    } catch (err) {
      console.error('Mic access denied:', err);
      return false;
    }
  }

  function start() {
    return new Promise(async (resolve, reject) => {
      if (!_stream) {
        const ok = await requestMic();
        if (!ok) { reject(new Error('Microphone access denied')); return; }
      }

      _chunks = [];
      _mediaRecorder = new MediaRecorder(_stream, { mimeType: getSupportedMimeType() });
      _mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) _chunks.push(e.data); };
      _mediaRecorder.onstop = () => {
        const blob = new Blob(_chunks, { type: getSupportedMimeType() });
        resolve(blob);
      };
      _mediaRecorder.onerror = (e) => reject(e.error);
      _mediaRecorder.start(250);
    });
  }

  function stop() {
    if (_mediaRecorder && _mediaRecorder.state !== 'inactive') {
      _mediaRecorder.stop();
    }
    stopWaveform();
    stopTimer();
  }

  function getSupportedMimeType() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg', 'audio/mp4'];
    for (const t of types) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
    return '';
  }

  function startWaveform(canvas) {
    if (!_stream) return;
    if (!_audioCtx) {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    _analyser = _audioCtx.createAnalyser();
    _analyser.fftSize = 256;
    const src = _audioCtx.createMediaStreamSource(_stream);
    src.connect(_analyser);

    const ctx = canvas.getContext('2d');
    const buf = new Uint8Array(_analyser.frequencyBinCount);
    const W = canvas.width;
    const H = canvas.height;

    function draw() {
      _animId = requestAnimationFrame(draw);
      _analyser.getByteFrequencyData(buf);

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, W, H);

      const barW = (W / buf.length) * 2.5;
      let x = 0;
      for (let i = 0; i < buf.length; i++) {
        const barH = (buf[i] / 255) * H;
        const r = 99 + Math.round((buf[i] / 255) * 100);
        const g = 30 + Math.round((buf[i] / 255) * 60);
        const b = 220;
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.beginPath();
        ctx.roundRect(x, H - barH, barW - 1, barH, 2);
        ctx.fill();
        x += barW + 1;
      }
    }
    draw();
  }

  function stopWaveform() {
    if (_animId) { cancelAnimationFrame(_animId); _animId = null; }
    if (_analyser) { _analyser.disconnect(); _analyser = null; }
  }

  function drawIdleWaveform(canvas) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#cbd5e1';
    const count = 40;
    const barW = W / count - 2;
    for (let i = 0; i < count; i++) {
      const barH = 4 + Math.random() * 8;
      ctx.beginPath();
      ctx.roundRect(i * (barW + 2), H / 2 - barH / 2, barW, barH, 2);
      ctx.fill();
    }
  }

  function startTimer(el, totalSeconds, onTick, onDone, countUp = false) {
    _timerEl = el;
    _seconds = countUp ? 0 : totalSeconds;
    _countUp = countUp;
    stopTimer();

    function tick() {
      const m = Math.floor(_seconds / 60);
      const s = _seconds % 60;
      if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
      if (onTick) onTick(_seconds);

      if (countUp) {
        _seconds++;
      } else {
        _seconds--;
        if (_seconds < 0) {
          stopTimer();
          if (onDone) onDone();
          return;
        }
      }
    }

    tick();
    _timerInterval = setInterval(tick, 1000);
  }

  function stopTimer() {
    if (_timerInterval) { clearInterval(_timerInterval); _timerInterval = null; }
  }

  function getElapsed() { return _countUp ? _seconds : 0; }

  function releaseStream() {
    if (_stream) {
      _stream.getTracks().forEach(t => t.stop());
      _stream = null;
    }
    if (_audioCtx) {
      _audioCtx.close();
      _audioCtx = null;
    }
  }

  return { start, stop, startWaveform, stopWaveform, drawIdleWaveform, startTimer, stopTimer, getElapsed, requestMic, releaseStream };
})();
