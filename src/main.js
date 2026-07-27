import JSZip from 'jszip';
import { checkLibraryFiles } from './zip-checker.js';

// Global variables
let allMaps = [];
let filteredMaps = [];
let missingMaps = [];
let activeDownloads = 0;
let downloadAbortController = null;
let isCancelRequested = false;
let isLogVisible = false; // Hidden by default to eliminate browser DOM lag!
let inMemoryLogs = [];
let currentZip = null;
let downloadLogs = [];

// DOM Elements
const dbLoader = document.getElementById('db-loader');
const dbStatusTitle = document.getElementById('db-status-title');
const dbStatusDesc = document.getElementById('db-status-desc');
const dbProgress = document.getElementById('db-progress');
const dbStatusSection = document.getElementById('db-status-section');

const valTotal = document.getElementById('val-total');
const valRanked = document.getElementById('val-ranked');
const valUnranked = document.getElementById('val-unranked');
const valQualified = document.getElementById('val-qualified');

const filterStatus = document.getElementById('filter-status');
const batchSize = document.getElementById('batch-size');
const batchSelect = document.getElementById('batch-select');
const batchRangeText = document.getElementById('batch-range-text');
const batchSizeEstimate = document.getElementById('batch-size-estimate');
const batchInfoPanel = document.getElementById('batch-info-panel');

const btnDownloadBatch = document.getElementById('btn-download-batch');
const btnDownloadAllMaps = document.getElementById('btn-download-all-maps');
const btnCancelDownload = document.getElementById('btn-cancel-download');

const downloadProgressContainer = document.getElementById('download-progress-container');
const downloadProgressStatus = document.getElementById('download-progress-status');
const downloadProgressPercent = document.getElementById('download-progress-percent');
const downloadProgressFill = document.getElementById('download-progress-fill');
const downloadStatCount = document.getElementById('download-stat-count');
const downloadStatSpeed = document.getElementById('download-stat-speed');
const downloadLog = document.getElementById('download-log');
const btnToggleLog = document.getElementById('btn-toggle-log');

const dropzone = document.getElementById('dropzone');
const fileUpload = document.getElementById('file-upload');
const folderUpload = document.getElementById('folder-upload');
const btnSelectFiles = document.getElementById('btn-select-files');
const btnSelectFolder = document.getElementById('btn-select-folder');
const zipProcessStatus = document.getElementById('zip-process-status');
const zipProcessTitle = document.getElementById('zip-process-title');
const zipProcessDesc = document.getElementById('zip-process-desc');

const syncResults = document.getElementById('sync-results');
const percentRing = document.getElementById('percent-ring');
const syncPercentText = document.getElementById('sync-percent-text');
const syncOwnedCount = document.getElementById('sync-owned-count');
const syncMissingCount = document.getElementById('sync-missing-count');
const missingMapsSection = document.getElementById('missing-maps-section');
const missingListCount = document.getElementById('missing-list-count');
const missingTableBody = document.getElementById('missing-table-body');
const btnDownloadMissingAll = document.getElementById('btn-download-missing-all');

// Custom Modal & Toast Notification System
function showCustomAlert(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const closeBtn = document.getElementById('modal-close-btn');

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    cancelBtn.style.display = 'none';
    confirmBtn.textContent = 'OK';
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      closeBtn.removeEventListener('click', onConfirm);
    };

    const onConfirm = () => {
      cleanup();
      resolve();
    };

    confirmBtn.addEventListener('click', onConfirm);
    closeBtn.addEventListener('click', onConfirm);
  });
}

function showCustomConfirm(title, message, confirmText = 'OK', cancelText = 'Cancel') {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const confirmBtn = document.getElementById('modal-confirm-btn');
    const closeBtn = document.getElementById('modal-close-btn');

    modalTitle.textContent = title;
    modalMessage.textContent = message;
    cancelBtn.style.display = 'inline-flex';
    cancelBtn.textContent = cancelText;
    confirmBtn.textContent = confirmText;
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      confirmBtn.removeEventListener('click', onConfirm);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
    };

    const onConfirm = () => {
      cleanup();
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    confirmBtn.addEventListener('click', onConfirm);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
  });
}

function showDownloadChoiceModal(title, message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('custom-modal');
    const modalTitle = document.getElementById('modal-title');
    const modalMessage = document.getElementById('modal-message');
    const modalFooter = document.getElementById('modal-footer');
    const closeBtn = document.getElementById('modal-close-btn');

    modalTitle.textContent = title;
    modalMessage.textContent = message;

    const originalFooterHTML = modalFooter.innerHTML;

    modalFooter.innerHTML = `
      <button id="modal-opt-cancel" class="btn btn-secondary btn-sm">Cancel</button>
      <button id="modal-opt-zip" class="btn btn-secondary btn-sm"><i class="fa-solid fa-file-zipper"></i> ZIP Download</button>
      <button id="modal-opt-folder" class="btn btn-primary btn-sm"><i class="fa-solid fa-folder-open"></i> Direct Folder</button>
    `;
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      modalFooter.innerHTML = originalFooterHTML;
    };

    const optFolder = document.getElementById('modal-opt-folder');
    const optZip = document.getElementById('modal-opt-zip');
    const optCancel = document.getElementById('modal-opt-cancel');

    optFolder.onclick = () => { cleanup(); resolve('folder'); };
    optZip.onclick = () => { cleanup(); resolve('zip'); };
    optCancel.onclick = () => { cleanup(); resolve('cancel'); };
    closeBtn.onclick = () => { cleanup(); resolve('cancel'); };
  });
}

function showToast(message, type = 'info', durationMs = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'success') icon = '<i class="fa-solid fa-circle-check" style="color: var(--success-color);"></i>';
  if (type === 'error') icon = '<i class="fa-solid fa-circle-exclamation" style="color: var(--danger-color);"></i>';

  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  fetchRhythiaDatabase();
  setupEventListeners();
});

// Setup Events
function setupEventListeners() {
  const navBtnHome = document.getElementById('nav-btn-home');
  const navBtnApp = document.getElementById('nav-btn-app');
  const btnHeroContinue = document.getElementById('btn-hero-continue');
  const heroSection = document.getElementById('hero-section');
  const webAppSection = document.getElementById('web-app-section');

  const showHome = () => {
    if (navBtnHome) navBtnHome.classList.add('active');
    if (navBtnApp) navBtnApp.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const showWebApp = () => {
    if (navBtnHome) navBtnHome.classList.remove('active');
    if (navBtnApp) navBtnApp.classList.add('active');
    if (webAppSection) webAppSection.scrollIntoView({ behavior: 'smooth' });
  };

  if (navBtnHome) navBtnHome.addEventListener('click', showHome);
  if (navBtnApp) navBtnApp.addEventListener('click', showWebApp);
  if (btnHeroContinue) btnHeroContinue.addEventListener('click', showWebApp);

  // Bulk Downloader Controls
  filterStatus.addEventListener('change', () => {
    applyFilters();
    updateBatchSelector();
  });
  
  batchSize.addEventListener('change', () => {
    updateBatchSelector();
  });
  
  batchSelect.addEventListener('change', () => {
    updateBatchInfo();
  });
  
  btnDownloadBatch.addEventListener('click', startBatchDownload);
  btnDownloadAllMaps.addEventListener('click', startDownloadAllMaps);
  btnCancelDownload.addEventListener('click', cancelDownload);
  
  // Library Checker Controls
  setupDragAndDrop();
  fileUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processLibraryFiles(e.target.files);
    }
  });

  folderUpload.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      processLibraryFiles(e.target.files);
    }
  });

  btnSelectFiles.addEventListener('click', (e) => {
    e.stopPropagation();
    fileUpload.click();
  });

  btnSelectFolder.addEventListener('click', (e) => {
    e.stopPropagation();
    folderUpload.click();
  });

  if (btnToggleLog) {
    btnToggleLog.addEventListener('click', toggleLogView);
  }

  btnDownloadMissingAll.addEventListener('click', startDownloadMissingAll);
}

// Fetch all maps from Rhythia API
async function fetchRhythiaDatabase() {
  const endpoint = 'https://production.rhythia.com/api/getBeatmaps';
  try {
    logToConsole('Syncing Rhythia database...', 'info');
    const firstPageRes = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 1, session: '' })
    });
    
    if (!firstPageRes.ok) {
      throw new Error(`Failed to fetch database: HTTP ${firstPageRes.status}`);
    }
    
    const data = await firstPageRes.json();
    if (data.error) {
      throw new Error(data.error);
    }
    
    const totalMapsCount = data.total;
    const viewPerPage = data.viewPerPage || 50;
    const totalPages = Math.ceil(totalMapsCount / viewPerPage);
    
    dbProgress.style.width = `${(1 / totalPages) * 100}%`;
    dbStatusDesc.textContent = `Syncing page 1 of ${totalPages}...`;
    
    const mapsByPage = new Map();
    mapsByPage.set(1, data.beatmaps || []);
    
    const pageQueue = [];
    for (let p = 2; p <= totalPages; p++) {
      pageQueue.push(p);
    }
    
    let completedPages = 1;
    const CONCURRENCY = 5;
    
    const fetchPageWithRetry = async (page, retries = 5) => {
      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page, session: '' })
          });
          if (res.ok) {
            const pageData = await res.json();
            if (pageData.beatmaps) {
              return pageData.beatmaps;
            }
          }
        } catch (e) {}
        await new Promise(r => setTimeout(r, 400 * attempt));
      }
      return [];
    };

    const fetchPageWorker = async () => {
      while (pageQueue.length > 0) {
        const page = pageQueue.shift();
        const pageMaps = await fetchPageWithRetry(page);
        mapsByPage.set(page, pageMaps);
        completedPages++;
        const percent = (completedPages / totalPages) * 100;
        dbProgress.style.width = `${percent}%`;
        dbStatusDesc.textContent = `Syncing page ${completedPages} of ${totalPages}...`;
      }
    };
    
    const workers = [];
    for (let i = 0; i < CONCURRENCY; i++) {
      workers.push(fetchPageWorker());
    }
    await Promise.all(workers);
    
    let loadedMaps = [];
    for (let p = 1; p <= totalPages; p++) {
      if (mapsByPage.has(p)) {
        loadedMaps = loadedMaps.concat(mapsByPage.get(p));
      }
    }
    
    allMaps = loadedMaps;
    
    // Update Stats Cards from 100% loaded maps
    const totalCount = allMaps.length;
    const rankedCount = allMaps.filter(m => m.status === 'RANKED').length;
    const qualifiedCount = allMaps.filter(m => m.status === 'QUALIFIED').length;
    const unrankedCount = totalCount - rankedCount - qualifiedCount; // Includes all community & unranked maps
    
    valTotal.textContent = totalCount.toLocaleString();
    valRanked.textContent = rankedCount.toLocaleString();
    valUnranked.textContent = unrankedCount.toLocaleString();
    valQualified.textContent = qualifiedCount.toLocaleString();
    
    dbStatusTitle.textContent = 'Rhythia Database Synced Successfully!';
    dbStatusDesc.textContent = `Fully synchronized with ${totalCount.toLocaleString()} maps. Ready.`;
    dbLoader.classList.add('done');
    dbProgress.style.background = '#39ff14';
    
    applyFilters();
    updateBatchSelector();
    btnDownloadBatch.disabled = false;
    btnDownloadAllMaps.disabled = false;
    
    const dropzone = document.getElementById('dropzone');
    const fileUpload = document.getElementById('file-upload');
    const folderUpload = document.getElementById('folder-upload');
    const btnSelectFiles = document.getElementById('btn-select-files');
    const btnSelectFolder = document.getElementById('btn-select-folder');
    const uploadStatusText = document.getElementById('upload-status-text');

    if (dropzone) dropzone.classList.remove('disabled');
    if (fileUpload) fileUpload.disabled = false;
    if (folderUpload) folderUpload.disabled = false;
    if (btnSelectFiles) btnSelectFiles.disabled = false;
    if (btnSelectFolder) btnSelectFolder.disabled = false;
    if (uploadStatusText) {
      uploadStatusText.textContent = 'Note: Processing is done entirely in your browser. No files are uploaded to any server.';
    }
    
    setTimeout(() => {
      dbStatusSection.style.transition = 'opacity 0.5s ease';
      dbStatusSection.style.opacity = '0';
      setTimeout(() => dbStatusSection.style.display = 'none', 500);
    }, 2500);
    
  } catch (err) {
    dbStatusTitle.textContent = 'Sync Failed';
    dbStatusDesc.textContent = err.message;
    dbProgress.style.background = 'var(--neon-pink)';
    console.error(err);
  }
}

// Apply Selected Map Type Filter
function applyFilters() {
  const status = filterStatus.value;
  if (status === 'ALL') {
    filteredMaps = [...allMaps];
  } else if (status === 'UNRANKED') {
    filteredMaps = allMaps.filter(m => m.status !== 'RANKED' && m.status !== 'QUALIFIED');
  } else {
    filteredMaps = allMaps.filter(m => m.status === status);
  }
  
  filteredMaps.sort((a, b) => b.id - a.id);
}

// Update the Batch Select dropdown options
function updateBatchSelector() {
  const size = parseInt(batchSize.value, 10);
  const total = filteredMaps.length;
  const numBatches = Math.ceil(total / size);
  
  batchSelect.innerHTML = '';
  
  if (total === 0) {
    batchSelect.innerHTML = '<option value="0">No maps found</option>';
    batchInfoPanel.style.display = 'none';
    btnDownloadBatch.disabled = true;
    return;
  }
  
  btnDownloadBatch.disabled = false;
  
  for (let i = 0; i < numBatches; i++) {
    const start = i * size + 1;
    const end = Math.min((i + 1) * size, total);
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Batch ${i + 1} (Maps ${start}-${end})`;
    batchSelect.appendChild(option);
  }
  
  updateBatchInfo();
}

// Update Batch info panel description
function updateBatchInfo() {
  const size = parseInt(batchSize.value, 10);
  const batchIdx = parseInt(batchSelect.value, 10);
  const total = filteredMaps.length;
  
  const start = batchIdx * size + 1;
  const end = Math.min((batchIdx + 1) * size, total);
  
  batchRangeText.textContent = `Maps ${start} to ${end} of ${total}`;
  
  const count = end - start + 1;
  const estMb = count * 5;
  batchSizeEstimate.textContent = `Est. Size: ~${estMb} MB`;
  batchInfoPanel.style.display = 'flex';
}

// Log Console Toggle
function toggleLogView() {
  isLogVisible = !isLogVisible;
  const btnToggleLog = document.getElementById('btn-toggle-log');
  if (isLogVisible) {
    downloadLog.style.display = 'block';
    if (btnToggleLog) btnToggleLog.innerHTML = '<i class="fa-solid fa-eye-slash"></i> Hide Logs';
    renderLogsUI();
  } else {
    downloadLog.style.display = 'none';
    if (btnToggleLog) btnToggleLog.innerHTML = '<i class="fa-solid fa-eye"></i> Show Logs';
  }
}

// Optimized non-laggy logger helper
function logToConsole(message, type = 'info') {
  const time = new Date().toLocaleTimeString();
  const entry = { text: `[${time}] ${message}`, type };
  
  inMemoryLogs.push(entry);
  if (inMemoryLogs.length > 50) {
    inMemoryLogs.shift();
  }

  if (isLogVisible) {
    renderLogsUI();
  }
}

function renderLogsUI() {
  if (!isLogVisible || !downloadLog) return;
  
  const fragment = document.createDocumentFragment();
  for (const log of inMemoryLogs) {
    const line = document.createElement('div');
    line.className = `log-line ${log.type}`;
    line.textContent = log.text;
    fragment.appendChild(line);
  }
  
  downloadLog.innerHTML = '';
  downloadLog.appendChild(fragment);
  downloadLog.scrollTop = downloadLog.scrollHeight;
}

// Helper to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Cancel active downloads
function cancelDownload() {
  isCancelRequested = true;
  if (downloadAbortController) {
    downloadAbortController.abort();
  }
  logToConsole('Download cancelled by user.', 'error');
  resetDownloadUI();
}

// Reset Download Progress Panels
function resetDownloadUI() {
  btnDownloadBatch.style.display = 'inline-flex';
  btnDownloadAllMaps.style.display = 'inline-flex';
  btnCancelDownload.style.display = 'none';
  downloadProgressContainer.style.display = 'none';
  downloadProgressFill.style.width = '0%';
  downloadAbortController = null;
}

// Start downloading selected batch
async function startBatchDownload() {
  const size = parseInt(batchSize.value, 10);
  const batchIdx = parseInt(batchSelect.value, 10);
  const total = filteredMaps.length;
  
  const start = batchIdx * size;
  const end = Math.min((batchIdx + 1) * size, total);
  const batchMaps = filteredMaps.slice(start, end);
  
  if (batchMaps.length === 0) {
    await showCustomAlert("No Maps Selected", "No maps found to download.");
    return;
  }

  const isDirectoryPickerSupported = typeof window.showDirectoryPicker === 'function';
  const batchName = `rhythia-batch-${batchIdx + 1}`;
  
  if (isDirectoryPickerSupported) {
    const choice = await showDownloadChoiceModal(
      `Download Batch ${batchIdx + 1}`,
      `You are about to download Batch ${batchIdx + 1} (${batchMaps.length} maps).\n\n` +
      `Please choose how you would like to download them:\n\n` +
      `• Direct Folder (Recommended): Saves map files directly into a folder on your computer without memory limits.\n\n` +
      `• ZIP Download: Downloads maps as a single ZIP file.`
    );
    
    if (choice === 'folder') {
      await startDirectFolderDownload(batchMaps);
    } else if (choice === 'zip') {
      await downloadMapsZip(batchMaps, `${batchName}.zip`);
    }
  } else {
    await downloadMapsZip(batchMaps, `${batchName}.zip`);
  }
}

// Main download routine (shared by batch and missing maps)
function downloadMapsZip(mapsList, zipName, isSequential = false) {
  return new Promise(async (resolve) => {
    if (mapsList.length === 0) {
      await showCustomAlert("No Maps Selected", "No maps found to download.");
      resolve();
      return;
    }
    
    btnDownloadBatch.style.display = 'none';
    btnDownloadAllMaps.style.display = 'none';
    btnCancelDownload.style.display = 'inline-flex';
    downloadProgressContainer.style.display = 'block';
    downloadProgressStatus.textContent = 'Initializing zip package...';
    downloadProgressPercent.textContent = '0%';
    downloadProgressFill.style.width = '0%';
    downloadStatCount.textContent = `0 / ${mapsList.length} maps downloaded`;
    downloadStatSpeed.textContent = '0.0 MB/s';
    downloadLog.innerHTML = '';
    
    logToConsole(`Starting download queue for ${mapsList.length} maps...`, 'info');
    
    downloadAbortController = new AbortController();
    const signal = downloadAbortController.signal;
    
    const zip = new JSZip();
    const totalMaps = mapsList.length;
    let downloadedCount = 0;
    let downloadedBytes = 0;
    
    const startTime = Date.now();
    let lastTime = startTime;
    let lastBytes = 0;
    
    // Queue config (1 download at a time for 100% stable main-thread responsiveness)
    const CONCURRENCY = 1;
    const queue = [...mapsList];
    
    const worker = async () => {
      while (queue.length > 0 && !signal.aborted) {
        const map = queue.shift();
        try {
          logToConsole(`Fetching: ${map.title} (${map.id})`, 'info');
          
          const response = await fetch(map.beatmapFile, { signal });
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          const arrayBuffer = await response.arrayBuffer();
          const uint8Data = new Uint8Array(arrayBuffer);
          
          // Extract filename from URL
          const parts = map.beatmapFile.split('/');
          const fileName = parts[parts.length - 1];
          
          // Save uncompressed directly into ZIP to save CPU/Memory
          zip.file(fileName, uint8Data, { binary: true });
          
          downloadedCount++;
          downloadedBytes += arrayBuffer.byteLength;
          
          // Update stats
          const progressPercent = Math.round((downloadedCount / totalMaps) * 100);
          downloadProgressPercent.textContent = `${progressPercent}%`;
          downloadProgressFill.style.width = `${progressPercent}%`;
          downloadStatCount.textContent = `${downloadedCount} / ${totalMaps} maps downloaded`;
          
          // Speed calculation
          const now = Date.now();
          const elapsedSec = (now - lastTime) / 1000;
          if (elapsedSec >= 1.0) {
            const deltaBytes = downloadedBytes - lastBytes;
            const speed = deltaBytes / elapsedSec;
            downloadStatSpeed.textContent = `${formatBytes(speed)}/s`;
            lastBytes = downloadedBytes;
            lastTime = now;
          }
          
          logToConsole(`Finished: ${map.title} (${formatBytes(arrayBuffer.byteLength)})`, 'success');
          
          // Yield 20ms to browser main thread after EVERY map so Chrome stays 100% responsive
          await new Promise(r => setTimeout(r, 20));
          
        } catch (err) {
          if (err.name === 'AbortError') {
            break;
          }
          logToConsole(`Error downloading ${map.title}: ${err.message}`, 'error');
        }
      }
    };
    
    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      workers.push(worker());
    }
    
    await Promise.all(workers);
    
    if (signal.aborted) {
      resetDownloadUI();
      resolve();
      return;
    }
    
    downloadProgressStatus.textContent = 'Compiling ZIP archive (please wait)...';
    logToConsole('Compiling ZIP archive... Writing metadata catalog.', 'info');
    
    try {
      // Generate ZIP with STREAM (streamFiles: true) to prevent Chrome memory crashes
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE',
        streamFiles: true
      }, (metadata) => {
        downloadProgressPercent.textContent = `${Math.round(metadata.percent)}%`;
        downloadProgressFill.style.width = `${metadata.percent}%`;
      });
      
      downloadProgressStatus.textContent = 'Download Complete!';
      logToConsole(`ZIP Compiled successfully. Total size: ${formatBytes(zipBlob.size)}`, 'success');
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = zipName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
    } catch (err) {
      logToConsole(`Failed to build ZIP file: ${err.message}`, 'error');
      console.error(err);
    } finally {
      if (!isSequential) {
        setTimeout(() => {
          resetDownloadUI();
        }, 4000);
      }
      resolve();
    }
  });
}

// Download ALL Maps
async function startDownloadAllMaps() {
  const maps = [...filteredMaps];
  if (maps.length === 0) {
    await showCustomAlert("No Maps Found", "No maps match the current filter selection.");
    return;
  }

  const isDirectoryPickerSupported = typeof window.showDirectoryPicker === 'function';
  
  if (isDirectoryPickerSupported) {
    const choice = await showDownloadChoiceModal(
      "Download ALL Maps",
      `You are about to download ALL ${maps.length} maps.\n\n` +
      `Please choose how you would like to download them:\n\n` +
      `• Direct Folder (Recommended): Saves map files directly into a folder on your computer without memory limits.\n\n` +
      `• Sequential ZIPs: Downloads maps in chunks of 200 as separate ZIP files.`
    );
    
    if (choice === 'folder') {
      await startDirectFolderDownload(maps);
    } else if (choice === 'zip') {
      await startAutoSplittingZipDownload(maps);
    }
    return;
  } else {
    const proceed = await showCustomConfirm(
      "Download ALL Maps",
      `Your browser does not support writing files directly to local directories.\n\n` +
      `Would you like to download all ${maps.length} maps in split ZIP files (200 maps per ZIP) automatically?`,
      "Start Download",
      "Cancel"
    );
    if (proceed) {
      await startAutoSplittingZipDownload(maps);
    }
  }
}

// Download maps directly to local directory
async function startDirectFolderDownload(maps) {
  let dirHandle;
  try {
    logToConsole("Requesting directory access...", "info");
    dirHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });
  } catch (err) {
    logToConsole(`Directory access declined: ${err.message}`, "error");
    return;
  }
  
  btnDownloadBatch.style.display = 'none';
  btnDownloadAllMaps.style.display = 'none';
  btnCancelDownload.style.display = 'inline-flex';
  downloadProgressContainer.style.display = 'block';
  downloadProgressStatus.textContent = 'Preparing files...';
  downloadProgressPercent.textContent = '0%';
  downloadProgressFill.style.width = '0%';
  downloadStatCount.textContent = `0 / ${maps.length} maps downloaded`;
  downloadStatSpeed.textContent = '0.0 MB/s';
  downloadLog.innerHTML = '';
  
  logToConsole(`Starting direct download of ${maps.length} maps to folder: ${dirHandle.name}`, 'info');
  
  downloadAbortController = new AbortController();
  const signal = downloadAbortController.signal;
  
  const totalMaps = maps.length;
  let downloadedCount = 0;
  let downloadedBytes = 0;
  let lastBytes = 0;
  let lastTime = Date.now();
  
  // Queue config (1 file write stream at a time to prevent Chrome FileSystem IPC locks & .crswap crashes)
  const CONCURRENCY = 1;
  const queue = [...maps];
  
  const worker = async () => {
    while (queue.length > 0 && !signal.aborted) {
      const map = queue.shift();
      try {
        logToConsole(`Fetching: ${map.title} (${map.id})`, 'info');
        const response = await fetch(map.beatmapFile, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const parts = map.beatmapFile.split('/');
        const fileName = parts[parts.length - 1];
        
        // Save file directly to folder with zero JS memory allocation using ReadableStream.pipeTo
        const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
        const writable = await fileHandle.createWritable();
        
        if (response.body && response.body.pipeTo) {
          await response.body.pipeTo(writable);
        } else {
          const arrayBuffer = await response.arrayBuffer();
          await writable.write(arrayBuffer);
          await writable.close();
        }
        
        // Brief yield to allow Chrome FileSystem API to complete .crswap -> final filename renaming
        await new Promise(r => setTimeout(r, 15));
        
        downloadedCount++;
        downloadedBytes += arrayBuffer.byteLength;
        
        const progressPercent = Math.round((downloadedCount / totalMaps) * 100);
        downloadProgressPercent.textContent = `${progressPercent}%`;
        downloadProgressFill.style.width = `${progressPercent}%`;
        downloadStatCount.textContent = `${downloadedCount} / ${totalMaps} maps downloaded`;
        
        const now = Date.now();
        const elapsedSec = (now - lastTime) / 1000;
        if (elapsedSec >= 1.0) {
          const speed = (downloadedBytes - lastBytes) / elapsedSec;
          downloadStatSpeed.textContent = `${formatBytes(speed)}/s`;
          lastBytes = downloadedBytes;
          lastTime = now;
        }
        
        logToConsole(`Saved: ${fileName} (${formatBytes(arrayBuffer.byteLength)})`, 'success');
      } catch (err) {
        if (err.name === 'AbortError') break;
        logToConsole(`Error saving ${map.title}: ${err.message}`, 'error');
      }
    }
  };
  
  const workers = [];
  for (let i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  
  if (signal.aborted) {
    resetDownloadUI();
    return;
  }
  
  downloadProgressStatus.textContent = 'Direct Sync Complete!';
  logToConsole(`Direct folder sync complete. Total: ${downloadedCount} maps downloaded.`, 'success');
  
  setTimeout(() => {
    resetDownloadUI();
  }, 4000);
}

// Automatically downloads sequential ZIP chunks of 200 maps
async function startAutoSplittingZipDownload(maps) {
  isCancelRequested = false;
  const CHUNK_SIZE = 200;
  const totalMaps = maps.length;
  const totalChunks = Math.ceil(totalMaps / CHUNK_SIZE);
  
  logToConsole(`Splitting ${totalMaps} maps into ${totalChunks} ZIP files...`, 'info');
  
  for (let c = 0; c < totalChunks; c++) {
    if (isCancelRequested) {
      logToConsole('Sequential download cancelled cleanly.', 'error');
      break;
    }
    
    const start = c * CHUNK_SIZE;
    const end = Math.min((c + 1) * CHUNK_SIZE, totalMaps);
    const chunkMaps = maps.slice(start, end);
    
    logToConsole(`Starting ZIP Batch ${c + 1} of ${totalChunks} (Maps ${start + 1}-${end})...`, 'info');
    
    await downloadMapsZip(chunkMaps, `rhythia-all-part-${c + 1}.zip`, true);
    
    if (isCancelRequested) {
      logToConsole('Sequential download cancelled cleanly.', 'error');
      break;
    }
    
    if (c < totalChunks - 1) {
      logToConsole(`Waiting 5 seconds before starting Part ${c + 2}...`, 'info');
      await new Promise(resolve => {
        const timeoutId = setTimeout(resolve, 5000);
        const checkInterval = setInterval(() => {
          if (isCancelRequested) {
            clearTimeout(timeoutId);
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });
    }
  }
  
  resetDownloadUI();
}

// Drag & Drop library checker
function setupDragAndDrop() {
  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });
  
  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
      processLibraryFiles(files);
    }
  });
}

// Library Checker Sync Handler
async function processLibraryFiles(files) {
  zipProcessStatus.style.display = 'flex';
  syncResults.style.display = 'none';
  missingMapsSection.style.display = 'none';
  
  const zipProgress = document.getElementById('zip-progress');
  if (zipProgress) zipProgress.style.width = '0%';
  
  try {
    const results = await checkLibraryFiles(files, allMaps, (title, desc, percent) => {
      zipProcessTitle.textContent = title;
      zipProcessDesc.textContent = desc;
      if (zipProgress && percent !== undefined) {
        zipProgress.style.width = `${percent}%`;
      }
    });
    
    zipProcessStatus.style.display = 'none';
    
    syncResults.style.display = 'block';
    const totalDbCount = allMaps.length;
    const ownedCount = results.owned.length;
    const missingCount = results.missing.length;
    
    syncOwnedCount.textContent = ownedCount.toLocaleString();
    syncMissingCount.textContent = missingCount.toLocaleString();
    
    const percentage = totalDbCount > 0 ? Math.round((ownedCount / totalDbCount) * 100) : 0;
    syncPercentText.textContent = `${percentage}%`;
    
    const offset = 251 - (percentage / 100) * 251;
    percentRing.style.strokeDashoffset = offset;
    
    missingMaps = results.missing;
    
    if (missingCount > 0) {
      missingListCount.textContent = missingCount.toLocaleString();
      renderMissingMapsTable(results.missing);
      missingMapsSection.style.display = 'flex';
      showToast(`Scan complete! Found ${ownedCount} owned maps.`, 'success');
    } else {
      missingMapsSection.style.display = 'none';
      await showCustomAlert("Library Up to Date", "Awesome! Your music library is fully up to date. You have all Rhythia maps!");
    }
    
  } catch (err) {
    zipProcessStatus.style.display = 'none';
    await showCustomAlert("Library Scan Failed", err.message);
    console.error(err);
  }
}

// Render Missing Maps inside Sync table
function renderMissingMapsTable(maps) {
  missingTableBody.innerHTML = '';
  
  const renderLimit = Math.min(maps.length, 100);
  
  for (let i = 0; i < renderLimit; i++) {
    const map = maps[i];
    const row = document.createElement('tr');
    
    let diffClass = 'diff-easy';
    let diffName = 'Easy';
    if (map.difficulty >= 7) {
      diffClass = 'diff-hard';
      diffName = 'Expert';
    } else if (map.difficulty >= 4) {
      diffClass = 'diff-medium';
      diffName = 'Hard';
    }
    
    row.innerHTML = `
      <td>
        <div class="map-cell-title">${map.title || 'Unknown Title'}</div>
        <div class="map-cell-author">by ${map.ownerUsername || 'Unknown Mapper'}</div>
      </td>
      <td>
        <span class="diff-badge ${diffClass}">${diffName} (${map.difficulty})</span>
      </td>
      <td>
        <button class="download-icon-btn" title="Download Map" data-id="${map.id}">
          <i class="fa-solid fa-download"></i>
        </button>
      </td>
    `;
    
    const downloadBtn = row.querySelector('.download-icon-btn');
    downloadBtn.addEventListener('click', () => {
      downloadSingleMap(map);
    });
    
    missingTableBody.appendChild(row);
  }
  
  if (maps.length > 100) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td colspan="3" style="text-align: center; color: var(--text-muted); font-style: italic;">
        Showing first 100 of ${maps.length.toLocaleString()} missing maps. There are ${(maps.length - 100).toLocaleString()} more maps not listed here.
      </td>
    `;
    missingTableBody.appendChild(row);
  }
}

// Download a single RHM map file
async function downloadSingleMap(map) {
  try {
    const parts = map.beatmapFile.split('/');
    const fileName = parts[parts.length - 1];
    
    const link = document.createElement('a');
    link.href = map.beatmapFile;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Downloading ${map.title}...`, 'info');
  } catch (err) {
    await showCustomAlert("Download Failed", `Failed to download map: ${err.message}`);
  }
}

// Download all missing maps
async function startDownloadMissingAll() {
  if (missingMaps.length === 0) return;
  
  const maps = [...missingMaps];
  const isDirectoryPickerSupported = typeof window.showDirectoryPicker === 'function';
  
  if (isDirectoryPickerSupported) {
    const choice = await showDownloadChoiceModal(
      "Download Missing Maps",
      `You are missing ${maps.length} maps from your library.\n\n` +
      `Please choose how you would like to download them:\n\n` +
      `• Direct Folder (Recommended): Saves missing map files directly into a folder on your computer without memory limits.\n\n` +
      `• Sequential ZIPs: Downloads missing maps as ZIP files.`
    );
    
    if (choice === 'folder') {
      await startDirectFolderDownload(maps);
    } else if (choice === 'zip') {
      if (maps.length > 200) {
        await startAutoSplittingZipDownload(maps);
      } else {
        await downloadMapsZip(maps, 'rhythia-missing-maps.zip');
      }
    }
    return;
  } else {
    const proceed = await showCustomConfirm(
      "Download Missing Maps",
      `Would you like to download all ${maps.length} missing maps as a ZIP file?`,
      "Start Download",
      "Cancel"
    );
    if (proceed) {
      if (maps.length > 200) {
        await startAutoSplittingZipDownload(maps);
      } else {
        await downloadMapsZip(maps, 'rhythia-missing-maps.zip');
      }
    }
  }
}
