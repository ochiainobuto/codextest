(function () {
  'use strict';


    return;
  }

  const { createFFmpeg, fetchFile } = window.FFmpeg;

  app.innerHTML = `
    <main>
      <h1>連番静止画からMP4を作成</h1>
      <p class="description">
        29.97fps (30000/1001fps) の動画として静止画の連番を結合し、MP4ファイルを生成します。
        画像ファイルをドラッグ＆ドロップするか、ファイル選択からまとめて指定してください。
      </p>

      <section class="section">
        <label id="drop-area" class="file-input" tabindex="0">
          <span>静止画ファイルをここにドロップ、またはクリックして選択</span>
          <input id="file-input" type="file" accept="image/*" multiple />
          <small class="hint">同じフォーマットで連番になるようにファイル名を揃えてください。</small>
        </label>
        <ul id="file-list" class="file-list"></ul>
      </section>

      <section class="section">
        <button id="convert-button" disabled>MP4に変換してダウンロード</button>
        <div id="progress-wrapper" class="progress-container" style="display: none;">
          <progress id="progress" max="100" value="0"></progress>
          <span id="progress-label">0%</span>
        </div>
        <p id="status" class="status"></p>
        <a id="download-link" style="display: none;" download="sequence.mp4">生成された動画をダウンロード</a>
      </section>

      <p class="footer-note">ブラウザ上で変換が完結します。大きなファイルでは時間がかかる場合があります。</p>
    </main>
  `;

  const fileInput = document.querySelector('#file-input');
  const dropArea = document.querySelector('#drop-area');
  const fileList = document.querySelector('#file-list');
  const convertButton = document.querySelector('#convert-button');
  const statusEl = document.querySelector('#status');
  const progressWrapper = document.querySelector('#progress-wrapper');
  const progressEl = document.querySelector('#progress');
  const progressLabel = document.querySelector('#progress-label');
  const downloadLink = document.querySelector('#download-link');

  let selectedFiles = [];

  let isFFmpegLoaded = false;

  const sortFiles = (files) =>
    [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const updateFileList = () => {
    fileList.innerHTML = '';
    if (!selectedFiles.length) {
      convertButton.disabled = true;
      return;
    }

    const fragment = document.createDocumentFragment();
    selectedFiles.forEach((file, index) => {
      const item = document.createElement('li');
      item.textContent = `${String(index + 1).padStart(3, '0')}. ${file.name}`;
      fragment.appendChild(item);
    });
    fileList.appendChild(fragment);
    convertButton.disabled = false;
  };

  const setStatus = (message, isError = false) => {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
  };

  const resetProgress = () => {
    progressEl.value = 0;
    progressLabel.textContent = '0%';
    progressWrapper.style.display = 'none';
  };

  const showProgress = () => {
    progressWrapper.style.display = 'flex';
  };

  const hideDownloadLink = () => {
    if (downloadLink.href) {
      URL.revokeObjectURL(downloadLink.href);
    }
    downloadLink.style.display = 'none';
  };

  const prepareFiles = (files) => {
    selectedFiles = sortFiles(files);
    hideDownloadLink();
    resetProgress();
    setStatus('');
    updateFileList();
  };

  fileInput.addEventListener('change', (event) => {
    prepareFiles(event.target.files);
  });

  const handleDrop = (event) => {
    event.preventDefault();
    dropArea.classList.remove('dragover');
    if (event.dataTransfer?.files?.length) {
      prepareFiles(event.dataTransfer.files);
    }
  };

  dropArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropArea.classList.add('dragover');
  });

  dropArea.addEventListener('dragleave', () => {
    dropArea.classList.remove('dragover');
  });

  dropArea.addEventListener('drop', handleDrop);

  const ensureFFmpegLoaded = async () => {
    if (!isFFmpegLoaded) {
      setStatus('FFmpeg.wasm を読み込み中です…');
      await ffmpeg.load();
      isFFmpegLoaded = true;
    }
  };

  const writeFramesToFS = async (extension) => {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      const frameName = `frame_${String(index + 1).padStart(6, '0')}.${extension}`;
      try {
        ffmpeg.FS('unlink', frameName);
      } catch (error) {
        // ignore when file does not exist
      }
      const data = await fetchFile(file);
      ffmpeg.FS('writeFile', frameName, data);
      const ratio = (index + 1) / selectedFiles.length;
      progressEl.value = Math.round(ratio * 100 * 0.3);
      progressLabel.textContent = `フレーム準備中 ${Math.round(ratio * 30)}%`;
    }
  };

  const cleanupFS = (extension) => {
    for (let index = 0; index < selectedFiles.length; index += 1) {
      const frameName = `frame_${String(index + 1).padStart(6, '0')}.${extension}`;
      try {
        ffmpeg.FS('unlink', frameName);
      } catch (error) {
        // ignore
      }
    }
    try {
      ffmpeg.FS('unlink', 'output.mp4');
    } catch (error) {
      // ignore
    }
  };

  ffmpeg.setProgress(({ ratio }) => {
    if (progressWrapper.style.display === 'none') {
      showProgress();
    }
    const percent = Math.min(100, Math.max(0, Math.round(30 + ratio * 70)));
    progressEl.value = percent;
    progressLabel.textContent = `変換中 ${percent}%`;
  });

  convertButton.addEventListener('click', async () => {
    if (!selectedFiles.length) return;

    const uniqueExtensions = new Set(
      selectedFiles.map((file) => file.name.split('.').pop()?.toLowerCase() ?? '')
    );
    if (uniqueExtensions.size > 1) {
      setStatus('すべてのファイルは同じ拡張子にしてください。', true);
      return;
    }

    const [extension] = [...uniqueExtensions];
    if (!extension) {
      setStatus('ファイルの拡張子を特定できませんでした。', true);
      return;
    }

    convertButton.disabled = true;
    showProgress();
    setStatus('変換を開始します…');
    hideDownloadLink();

    try {
      await ensureFFmpegLoaded();
      setStatus('フレームを書き込み中です…');
      await writeFramesToFS(extension);

      setStatus('動画を生成しています…');
      try {
        ffmpeg.FS('unlink', 'output.mp4');
      } catch (error) {
        // ignore existing output
      }

      await ffmpeg.run(
        '-framerate',
        '30000/1001',
        '-i',
        `frame_%06d.${extension}`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        'output.mp4'
      );

      const data = ffmpeg.FS('readFile', 'output.mp4');
      const blob = new Blob([data.buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      downloadLink.href = url;
      downloadLink.style.display = 'inline-block';
      setStatus('変換が完了しました。ダウンロードリンクから保存できます。');
    } catch (error) {
      console.error(error);
      setStatus('変換中にエラーが発生しました。コンソールを確認してください。', true);
    } finally {
      cleanupFS(extension);
      convertButton.disabled = false;
      progressLabel.textContent = '100%';
    }
  });
})();
