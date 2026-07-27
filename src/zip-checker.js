import JSZip from 'jszip';

/**
 * Parses uploaded files (multiple .sspm/.rhm files, ZIP archives, or directory trees)
 * and matches their contents against the Rhythia maps database.
 * @param {FileList|Array<File>} fileList - The uploaded files or folder items.
 * @param {Array} databaseMaps - The array of maps fetched from the Rhythia API.
 * @param {Function} onProgress - Callback for progress updates (title, desc, percent).
 * @returns {Promise<Object>} Results containing owned and missing maps lists.
 */
export async function checkLibraryFiles(fileList, databaseMaps, onProgress) {
  const filesArray = Array.from(fileList);
  if (filesArray.length === 0) {
    throw new Error("No files selected.");
  }

  onProgress("Analyzing files...", `Processing ${filesArray.length} item(s)...`, 5);

  // Set up database lookup indices for fast matching
  const filenameToMap = new Map();
  const legacyIdToMap = new Map();
  const titleDiffToMap = new Map();

  for (const map of databaseMaps) {
    if (map.beatmapFile) {
      const parts = map.beatmapFile.split('/');
      const fname = parts[parts.length - 1];
      filenameToMap.set(fname.toLowerCase(), map);
    }

    if (map.image) {
      const parts = map.image.split('-');
      const legacyId = parts[parts.length - 1];
      if (legacyId && legacyId.length === 16) {
        legacyIdToMap.set(legacyId.toLowerCase(), map);
      }
    }

    if (map.title) {
      const normTitle = map.title.toLowerCase().replace(/[^a-z0-9]/g, '');
      const key = `${normTitle}_${map.difficulty}`;
      titleDiffToMap.set(key, map);
    }
  }

  const ownedMaps = new Set();

  // Special case: If user uploaded exactly 1 single ZIP file (e.g. my_maps.zip containing 100s of maps)
  if (filesArray.length === 1 && filesArray[0].name.toLowerCase().endsWith('.zip')) {
    const singleZip = filesArray[0];
    onProgress("Reading ZIP archive...", "Parsing central directory listing", 10);
    const zip = new JSZip();
    let zipData;
    try {
      zipData = await zip.loadAsync(singleZip);
    } catch (err) {
      throw new Error("Failed to parse ZIP file: " + err.message);
    }

    const internalFiles = Object.keys(zipData.files).filter(name => !zipData.files[name].dir);
    const totalInternal = internalFiles.length;

    let processedCount = 0;
    for (const filePath of internalFiles) {
      processedCount++;
      if (processedCount % 50 === 0 || processedCount === totalInternal) {
        const pct = 10 + Math.round((processedCount / totalInternal) * 90);
        onProgress("Scanning ZIP library...", `Processed ${processedCount} / ${totalInternal} files...`, pct);
      }

      const parts = filePath.split('/');
      const baseNameLower = parts[parts.length - 1].toLowerCase();

      if (baseNameLower.endsWith('.rhm') || baseNameLower.endsWith('.sspm') || baseNameLower.endsWith('.ssmp') || baseNameLower.endsWith('.zip')) {
        if (filenameToMap.has(baseNameLower)) {
          ownedMaps.add(filenameToMap.get(baseNameLower));
          continue;
        }
        try {
          const fileData = await zipData.files[filePath].async('arraybuffer');
          const innerZip = new JSZip();
          const innerData = await innerZip.loadAsync(fileData);
          const innerFiles = Object.keys(innerData.files);
          const mapFilePath = innerFiles.find(name => {
            const lower = name.toLowerCase();
            return lower === 'map' || lower === 'map.txt' || lower === 'map.json' || lower.endsWith('/map') || lower.endsWith('/map.txt') || lower.endsWith('/map.json');
          });
          if (mapFilePath) {
            const jsonStr = await innerData.files[mapFilePath].async('text');
            const mapJson = JSON.parse(jsonStr);
            let matched = false;
            if (mapJson.LegacyId && legacyIdToMap.has(mapJson.LegacyId.toLowerCase())) {
              ownedMaps.add(legacyIdToMap.get(mapJson.LegacyId.toLowerCase()));
              matched = true;
            }
            if (!matched && mapJson.Title) {
              const normTitle = mapJson.Title.toLowerCase().replace(/[^a-z0-9]/g, '');
              const key = `${normTitle}_${mapJson.Difficulty}`;
              if (titleDiffToMap.has(key)) {
                ownedMaps.add(titleDiffToMap.get(key));
              }
            }
          }
        } catch (e) {}
      } else if (baseNameLower === 'map' || baseNameLower === 'map.txt' || baseNameLower === 'map.json') {
        try {
          const jsonStr = await zipData.files[filePath].async('text');
          const mapJson = JSON.parse(jsonStr);
          let matched = false;
          if (mapJson.LegacyId && legacyIdToMap.has(mapJson.LegacyId.toLowerCase())) {
            ownedMaps.add(legacyIdToMap.get(mapJson.LegacyId.toLowerCase()));
            matched = true;
          }
          if (!matched && mapJson.Title) {
            const normTitle = mapJson.Title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const key = `${normTitle}_${mapJson.Difficulty}`;
            if (titleDiffToMap.has(key)) {
              ownedMaps.add(titleDiffToMap.get(key));
            }
          }
        } catch (e) {}
      }
    }
  } else {
    // Multiple files OR folder selected!
    let processedCount = 0;
    const totalFiles = filesArray.length;

    for (const fileObj of filesArray) {
      processedCount++;
      if (processedCount % 20 === 0 || processedCount === totalFiles) {
        const pct = Math.round((processedCount / totalFiles) * 100);
        onProgress("Scanning files & folders...", `Processed ${processedCount} / ${totalFiles} items...`, pct);
      }

      const fileNameLower = fileObj.name.toLowerCase();

      // 1. Fast match by filename
      if (filenameToMap.has(fileNameLower)) {
        ownedMaps.add(filenameToMap.get(fileNameLower));
        continue;
      }

      // Check if filename contains ID pattern e.g. rhythia-275612-178...
      const nameParts = fileNameLower.split('-');
      if (nameParts.length >= 2 && !isNaN(nameParts[1])) {
        const fileId = parseInt(nameParts[1], 10);
        const matchedById = databaseMaps.find(m => m.id === fileId);
        if (matchedById) {
          ownedMaps.add(matchedById);
          continue;
        }
      }

      // 2. Parse map JSON or packed map file (.sspm, .rhm, .ssmp, .zip)
      if (fileNameLower.endsWith('.sspm') || fileNameLower.endsWith('.rhm') || fileNameLower.endsWith('.ssmp') || fileNameLower.endsWith('.zip')) {
        try {
          const zip = new JSZip();
          const zipData = await zip.loadAsync(fileObj);
          const internalFiles = Object.keys(zipData.files);
          const mapFilePath = internalFiles.find(name => {
            const lower = name.toLowerCase();
            return lower === 'map' || lower === 'map.txt' || lower === 'map.json' || lower.endsWith('/map') || lower.endsWith('/map.txt') || lower.endsWith('/map.json');
          });

          if (mapFilePath) {
            const jsonStr = await zipData.files[mapFilePath].async('text');
            const mapJson = JSON.parse(jsonStr);
            let matched = false;
            if (mapJson.LegacyId && legacyIdToMap.has(mapJson.LegacyId.toLowerCase())) {
              ownedMaps.add(legacyIdToMap.get(mapJson.LegacyId.toLowerCase()));
              matched = true;
            }
            if (!matched && mapJson.Title) {
              const normTitle = mapJson.Title.toLowerCase().replace(/[^a-z0-9]/g, '');
              const key = `${normTitle}_${mapJson.Difficulty}`;
              if (titleDiffToMap.has(key)) {
                ownedMaps.add(titleDiffToMap.get(key));
              }
            }
          }
        } catch (e) {}
      } else if (fileNameLower === 'map' || fileNameLower === 'map.txt' || fileNameLower === 'map.json') {
        try {
          const jsonStr = await fileObj.text();
          const mapJson = JSON.parse(jsonStr);
          let matched = false;
          if (mapJson.LegacyId && legacyIdToMap.has(mapJson.LegacyId.toLowerCase())) {
            ownedMaps.add(legacyIdToMap.get(mapJson.LegacyId.toLowerCase()));
            matched = true;
          }
          if (!matched && mapJson.Title) {
            const normTitle = mapJson.Title.toLowerCase().replace(/[^a-z0-9]/g, '');
            const key = `${normTitle}_${mapJson.Difficulty}`;
            if (titleDiffToMap.has(key)) {
              ownedMaps.add(titleDiffToMap.get(key));
            }
          }
        } catch (e) {}
      }
    }
  }

  const ownedArray = Array.from(ownedMaps);
  const ownedIds = new Set(ownedArray.map(m => m.id));
  const missingMaps = databaseMaps.filter(m => !ownedIds.has(m.id));

  return {
    owned: ownedArray,
    missing: missingMaps
  };
}

export const checkLibraryZip = checkLibraryFiles;
