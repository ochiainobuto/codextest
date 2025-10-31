(function () {
  'use strict';

  var CDN_URL = 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.7/dist/ffmpeg.min.js';
  var app = document.querySelector('#app');

  if (!app) {
    return;
  }

  var libraryStatus = 'idle';
  var libraryCallbacks = [];

  function flushLibraryCallbacks(error) {
    var pending = libraryCallbacks.slice();
    libraryCallbacks.length = 0;
    for (var index = 0; index < pending.length; index += 1) {
      try {
        pending[index](error);
      } catch (callbackError) {
        setTimeout(
          (function (err) {
            return function () {
              throw err;
            };
          })(callbackError),
          0
        );
      }
    }
  }

  function loadFFmpegLibrary(callback) {
    if (libraryStatus === 'loaded') {
      callback(null);
      return;
    }

    if (libraryStatus === 'error') {
      callback(new Error('FFmpeg.wasm の読込に失敗しました。'));
      return;
    }

    libraryCallbacks.push(callback);

    if (libraryStatus === 'loading') {
      return;
    }

    libraryStatus = 'loading';

    var script = document.createElement('script');
    script.src = CDN_URL;
    script.async = true;
    script.onload = function () {
      libraryStatus = 'loaded';
      flushLibraryCallbacks(null);
    };
    script.onerror = function () {
      libraryStatus = 'error';
      flushLibraryCallbacks(new Error('FFmpeg.wasm の読込に失敗しました。'));
    };

    document.head.appendChild(script);
  }

  function showUnsupportedBrowserMessage() {
    app.innerHTML =
      '<main>' +
      '<h1>ブラウザが対応していません</h1>' +
      '<p class="description">FFmpeg.wasm を利用するには ES2015 構文と WebAssembly に対応した最新のブラウザが必要です。</p>' +
      '<ul class="file-list troubleshooting">' +
      '<li>Chrome, Edge, Firefox, Safari などの最新バージョンでアクセスしてください。</li>' +
      '<li>ブラウザをアップデート後にページを再読み込みしてください。</li>' +
      '</ul>' +
      '</main>';
  }

  function showLoadFailureMessage() {
    app.innerHTML =
      '<main>' +
      '<h1>アプリを読み込めませんでした</h1>' +
      '<p class="description">FFmpeg.wasm の読込に失敗しました。以下を確認してください。</p>' +
      '<ul class="file-list troubleshooting">' +
      '<li>Ports タブから <strong>5500</strong> 番ポートを開き、外部ブラウザで <code>index.html</code> を表示する。</li>' +
      '<li>ブラウザの開発者ツール Console に SharedArrayBuffer や Cross-Origin 関連のエラーが出ていないか確認する。</li>' +
      '<li>ネットワークに制限がある場合は再読込を試すか、別のブラウザで表示する。</li>' +
      '</ul>' +
      '</main>';
  }

  function showPreparingMessage() {
    app.innerHTML =
      '<main>' +
      '<h1>FFmpeg.wasm を準備しています</h1>' +
      '<p class="description">初回ロードには数秒かかる場合があります。読み込み完了後に変換画面が表示されます。</p>' +
      '</main>';
  }

  function initializeApp(FFmpegGlobal) {
    var createFFmpeg = FFmpegGlobal.createFFmpeg;
    var fetchFile = FFmpegGlobal.fetchFile;

    app.innerHTML =
      '<main>' +
      '<h1>連番静止画からMP4を作成</h1>' +
      '<p class="description">29.97fps (30000/1001fps) の動画として静止画の連番を結合し、MP4ファイルを生成します。' +
      '画像ファイルをドラッグ＆ドロップするか、ファイル選択からまとめて指定してください。</p>' +
      '<section class="section">' +
      '<label id="drop-area" class="file-input" tabindex="0">' +
      '<span>静止画ファイルをここにドロップ、またはクリックして選択</span>' +
      '<input id="file-input" type="file" accept="image/*" multiple />' +
      '<small class="hint">同じフォーマットで連番になるようにファイル名を揃えてください。</small>' +
      '</label>' +
      '<ul id="file-list" class="file-list"></ul>' +
      '</section>' +
      '<section class="section">' +
      '<button id="convert-button" disabled>MP4に変換してダウンロード</button>' +
      '<div id="progress-wrapper" class="progress-container" style="display: none;">' +
      '<progress id="progress" max="100" value="0"></progress>' +
      '<span id="progress-label">0%</span>' +
      '</div>' +
      '<p id="status" class="status"></p>' +
      '<a id="download-link" style="display: none;" download="sequence.mp4">生成された動画をダウンロード</a>' +
      '</section>' +
      '<p class="footer-note">ブラウザ上で変換が完結します。大きなファイルでは時間がかかる場合があります。</p>' +
      '</main>';

    var fileInput = document.querySelector('#file-input');
    var dropArea = document.querySelector('#drop-area');
    var fileList = document.querySelector('#file-list');
    var convertButton = document.querySelector('#convert-button');
    var statusEl = document.querySelector('#status');
    var progressWrapper = document.querySelector('#progress-wrapper');
    var progressEl = document.querySelector('#progress');
    var progressLabel = document.querySelector('#progress-label');
    var downloadLink = document.querySelector('#download-link');

    var selectedFiles = [];
    var ffmpeg = createFFmpeg({
      log: true,
      corePath: 'https://unpkg.com/@ffmpeg/core@0.12.7/dist/ffmpeg-core.js',
    });
    var isFFmpegLoaded = false;

    function padNumber(value, length) {
      var str = String(value);
      while (str.length < length) {
        str = '0' + str;
      }
      return str;
    }

    function sortFiles(files) {
      var array = Array.prototype.slice.call(files);
      array.sort(function (a, b) {
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });
      return array;
    }

    function updateFileList() {
      fileList.innerHTML = '';
      if (!selectedFiles.length) {
        convertButton.disabled = true;
        return;
      }

      var fragment = document.createDocumentFragment();
      for (var index = 0; index < selectedFiles.length; index += 1) {
        var file = selectedFiles[index];
        var item = document.createElement('li');
        item.textContent = padNumber(index + 1, 3) + '. ' + file.name;
        fragment.appendChild(item);
      }
      fileList.appendChild(fragment);
      convertButton.disabled = false;
    }

    function setStatus(message, isError) {
      if (typeof isError === 'undefined') {
        isError = false;
      }
      statusEl.textContent = message;
      statusEl.classList.toggle('error', isError);
    }

    function resetProgress() {
      progressEl.value = 0;
      progressLabel.textContent = '0%';
      progressWrapper.style.display = 'none';
    }

    function showProgress() {
      progressWrapper.style.display = 'flex';
    }

    function hideDownloadLink() {
      if (downloadLink.href) {
        URL.revokeObjectURL(downloadLink.href);
      }
      downloadLink.style.display = 'none';
    }

    function prepareFiles(files) {
      selectedFiles = sortFiles(files);
      hideDownloadLink();
      resetProgress();
      setStatus('');
      updateFileList();
    }

    if (fileInput) {
      fileInput.addEventListener('change', function (event) {
        prepareFiles(event.target.files);
      });
    }

    function handleDrop(event) {
      event.preventDefault();
      dropArea.classList.remove('dragover');
      if (event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length) {
        prepareFiles(event.dataTransfer.files);
      }
    }

    if (dropArea) {
      dropArea.addEventListener('dragover', function (event) {
        event.preventDefault();
        dropArea.classList.add('dragover');
      });

      dropArea.addEventListener('dragleave', function () {
        dropArea.classList.remove('dragover');
      });

      dropArea.addEventListener('drop', handleDrop);
    }

    function ensureFFmpegLoaded() {
      if (isFFmpegLoaded) {
        return Promise.resolve();
      }
      setStatus('FFmpeg.wasm を読み込み中です…');
      return ffmpeg.load().then(function () {
        isFFmpegLoaded = true;
      });
    }

    function writeFramesToFS(extension) {
      var promise = Promise.resolve();

      function writeNext(index) {
        if (index >= selectedFiles.length) {
          return promise;
        }

        promise = promise.then(function () {
          var file = selectedFiles[index];
          var frameName = 'frame_' + padNumber(index + 1, 6) + '.' + extension;
          try {
            ffmpeg.FS('unlink', frameName);
          } catch (error) {
            // ignore
          }
          return fetchFile(file).then(function (data) {
            ffmpeg.FS('writeFile', frameName, data);
            var ratio = (index + 1) / selectedFiles.length;
            progressEl.value = Math.round(ratio * 100 * 0.3);
            progressLabel.textContent = 'フレーム準備中 ' + Math.round(ratio * 30) + '%';
          });
        });

        return writeNext(index + 1);
      }

      return writeNext(0);
    }

    function cleanupFS(extension) {
      for (var index = 0; index < selectedFiles.length; index += 1) {
        var frameName = 'frame_' + padNumber(index + 1, 6) + '.' + extension;
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
    }

    ffmpeg.setProgress(function (progress) {
      if (progressWrapper.style.display === 'none') {
        showProgress();
      }
      var ratio = typeof progress.ratio === 'number' ? progress.ratio : 0;
      var percent = Math.min(100, Math.max(0, Math.round(30 + ratio * 70)));
      progressEl.value = percent;
      progressLabel.textContent = '変換中 ' + percent + '%';
    });

    convertButton.addEventListener('click', function () {
      if (!selectedFiles.length) {
        return;
      }

      var extension = null;
      var mismatch = false;

      for (var i = 0; i < selectedFiles.length; i += 1) {
        var name = selectedFiles[i].name;
        var parts = name ? name.split('.') : [];
        var currentExt = parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
        if (extension === null) {
          extension = currentExt;
        } else if (extension !== currentExt) {
          mismatch = true;
          break;
        }
      }

      if (mismatch) {
        setStatus('すべてのファイルは同じ拡張子にしてください。', true);
        return;
      }

      if (!extension) {
        setStatus('ファイルの拡張子を特定できませんでした。', true);
        return;
      }

      convertButton.disabled = true;
      showProgress();
      setStatus('変換を開始します…');
      hideDownloadLink();

      var conversionSuccessful = false;

      ensureFFmpegLoaded()
        .then(function () {
          setStatus('フレームを書き込み中です…');
          return writeFramesToFS(extension);
        })
        .then(function () {
          setStatus('動画を生成しています…');
          try {
            ffmpeg.FS('unlink', 'output.mp4');
          } catch (error) {
            // ignore existing output
          }
          return ffmpeg.run(
            '-framerate',
            '30000/1001',
            '-i',
            'frame_%06d.' + extension,
            '-c:v',
            'libx264',
            '-pix_fmt',
            'yuv420p',
            'output.mp4'
          );
        })
        .then(function () {
          var data = ffmpeg.FS('readFile', 'output.mp4');
          var buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
          var blob = new Blob([buffer], { type: 'video/mp4' });
          var url = URL.createObjectURL(blob);
          downloadLink.href = url;
          downloadLink.style.display = 'inline-block';
          setStatus('変換が完了しました。ダウンロードリンクから保存できます。');
          conversionSuccessful = true;
        })
        .catch(function (error) {
          console.error(error);
          setStatus('変換中にエラーが発生しました。コンソールを確認してください。', true);
          progressLabel.textContent = 'エラー';
        })
        .then(function () {
          cleanupFS(extension);
          convertButton.disabled = false;
          if (conversionSuccessful) {
            progressEl.value = 100;
            progressLabel.textContent = '100%';
          }
        });
    });
  }

  var supportsES2015 = true;
  try {
    new Function('const test = 1;');
  } catch (error) {
    supportsES2015 = false;
  }

  var supportsWasm = typeof WebAssembly === 'object';
  var supportsPromise = typeof Promise === 'function' && typeof Promise.resolve === 'function';
  var supportsBlob = typeof Blob === 'function';
  var supportsURL = typeof URL === 'function' && typeof URL.createObjectURL === 'function';

  if (!supportsES2015 || !supportsWasm || !supportsPromise || !supportsBlob || !supportsURL) {
    showUnsupportedBrowserMessage();
    return;
  }

  showPreparingMessage();

  loadFFmpegLibrary(function (error) {
    if (error || !window.FFmpeg || !window.FFmpeg.createFFmpeg) {
      showLoadFailureMessage();
      return;
    }
    initializeApp(window.FFmpeg);
  });
})();
