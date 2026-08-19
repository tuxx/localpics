/**
 * Modal windows and previews
 */

/**
 * Show image modal
 * @param {number} i - Index of the image in data array
 */
function showImageModal(i) {
  modalIndex = i;
  const file = data[i];
  const modal = document.getElementById("imageModal");
  const modalImg = document.getElementById("modalImg");
  const prevButton = document.getElementById("prevButton");
  const nextButton = document.getElementById("nextButton");

  // Update navigation buttons
  prevButton.classList.toggle("disabled", i <= 0);
  nextButton.classList.toggle("disabled", i >= data.length - 1);

  // Set crossOrigin to allow EXIF reading
  modalImg.crossOrigin = "anonymous";
  modalImg.src = file.path;
  document.getElementById("imageDownloadBtn").href = file.path;
  modal.style.display = "flex";

  // Reset EXIF panel
  if (detailsVisible) {
    // Wait for image to load before reading EXIF
    modalImg.onload = function() {
      toggleExif(true);
    };
    // Fallback: if image already loaded or fails, try after a short delay
    setTimeout(function() {
      if (modalImg.complete) {
        toggleExif(true);
      }
    }, 100);
  } else {
    document.getElementById("modalDetails").style.display = "none";
  }
}

/**
 * Navigate between images in modal
 * @param {number} dir - Direction to navigate (1 for next, -1 for previous)
 */
function navigateModal(dir) {
  if (modalIndex < 0) return;

  const newIndex = modalIndex + dir;

  // Check bounds
  if (newIndex < 0 || newIndex >= data.length) {
    return; // Do nothing if out of bounds
  }

  // Only navigate to images
  if (data[newIndex].type === "image") {
    showImageModal(newIndex);
  } else {
    // Look for next image in the direction we're going
    for (let i = newIndex; dir > 0 ? i < data.length : i >= 0; i += dir) {
      if (data[i].type === "image") {
        showImageModal(i);
        break;
      }
    }
  }
}

/**
 * Toggle EXIF data panel
 * @param {boolean} forceUpdate - Whether to force update without toggling
 */
function toggleExif(forceUpdate = false) {
  const details = document.getElementById("modalDetails");

  if (!forceUpdate) {
    detailsVisible = !detailsVisible;
  }

  if (!detailsVisible) {
    details.style.display = "none";
    return;
  }

  // Show loading state
  details.style.display = "block";
  details.innerHTML =
    '<div class="loading-container"><div class="spinner"></div><p>' + t('loading.imageData') + '</p></div>';

  const img = document.getElementById("modalImg");

  // Basic image info
  const info = [
    `<strong>${t('image.resolution')}:</strong> ${img.naturalWidth} × ${img.naturalHeight}`,
  ];
  info.push(`<strong>${t('image.file')}:</strong> ${data[modalIndex].name}`);
  info.push(`<strong>${t('image.size')}:</strong> ${formatFileSize(data[modalIndex].size)}`);

  // Try to get EXIF data
  try {
    if (typeof EXIF === 'undefined') {
      console.error('EXIF library not loaded');
      details.innerHTML = info.join("<br>") + "<p>EXIF library not loaded</p>";
      return;
    }
    
    // Ensure image is fully loaded before reading EXIF
    if (!img.complete) {
      img.onload = function() {
        readExifData(img, info, details);
      };
      // Set a timeout fallback
      setTimeout(function() {
        if (!img.complete) {
          img.onload = null;
          readExifData(img, info, details);
        }
      }, 3000);
      return;
    }
    
    readExifData(img, info, details);
  } catch (error) {
    console.error("Error reading EXIF data:", error);
    details.innerHTML = info.join("<br>") + "<p>" + t('error.exifReading') + "</p>";
  }
}

/**
 * Read EXIF data from image and update details panel
 * @param {HTMLImageElement} img - Image element
 * @param {Array} info - Array of info strings
 * @param {HTMLElement} details - Details container element
 */
function readExifData(img, info, details) {
  EXIF.getData(img, function () {
    try {
      const exif = EXIF.getAllTags(this);
      console.log('EXIF data:', exif);

      if (exif && Object.keys(exif).length > 0) {
        // Format date taken if available
        if (exif.DateTimeOriginal) {
          const dateParts = exif.DateTimeOriginal.split(" ");
          const date = dateParts[0].replace(/:/g, "-");
          const time = dateParts[1] || "";
          info.push(`<strong>${t('image.dateTaken')}:</strong> ${date} ${time}`);
        }

        // Camera info
        if (exif.Make || exif.Model) {
          const make = exif.Make || "";
          const model = exif.Model || "";
          info.push(`<strong>${t('image.camera')}:</strong> ${make} ${model}`.trim());
        }

        // Exposure info
        if (exif.ExposureTime) {
          const exposureTime =
            exif.ExposureTime < 1
              ? `1/${Math.round(1 / exif.ExposureTime)}`
              : exif.ExposureTime;
          info.push(`<strong>${t('image.exposure')}:</strong> ${exposureTime} sec`);
        }

        if (exif.FNumber) {
          info.push(`<strong>${t('image.aperture')}:</strong> f/${exif.FNumber}`);
        }

        if (exif.ISO) {
          info.push(`<strong>${t('image.iso')}:</strong> ${exif.ISO}`);
        }

        if (exif.FocalLength) {
          info.push(`<strong>${t('image.focalLength')}:</strong> ${exif.FocalLength}mm`);
        }

        // GPS coordinates if available
        if (exif.GPSLatitude && exif.GPSLongitude) {
          try {
            const lat = EXIF.getTag(this, "GPSLatitude");
            const lon = EXIF.getTag(this, "GPSLongitude");
            const latRef = EXIF.getTag(this, "GPSLatitudeRef") || "N";
            const lonRef = EXIF.getTag(this, "GPSLongitudeRef") || "W";

            if (lat && lon) {
              const latDecimal =
                (lat[0] + lat[1] / 60 + lat[2] / 3600) *
                (latRef === "N" ? 1 : -1);
              const lonDecimal =
                (lon[0] + lon[1] / 60 + lon[2] / 3600) *
                (lonRef === "E" ? 1 : -1);

              info.push(
                `<strong>${t('image.gps')}:</strong> ${latDecimal.toFixed(6)}, ${lonDecimal.toFixed(6)}`,
              );
              info.push(
                `<a href="https://maps.google.com/?q=${latDecimal.toFixed(6)},${lonDecimal.toFixed(6)}" target="_blank">${t('image.viewOnMap')}</a>`,
              );
            }
          } catch (e) {
            console.warn("Error processing GPS data:", e);
          }
        }

        // Add all other EXIF tags in a collapsible section
        info.push("<details><summary>" + t('image.allExifData') + "</summary><table>");
        for (const tag in exif) {
          // Skip binary data
          if (typeof exif[tag] === "object" && exif[tag] && exif[tag].length > 20)
            continue;

          let value = exif[tag];
          // Format value if it's an array
          if (Array.isArray(value)) {
            value = value.join(", ");
          }
          if (typeof value === 'string' && value.length > 200) {
            value = value.substring(0, 200) + "...";
          }
          if (value !== undefined && value !== null && value !== '') {
            info.push(
              `<tr><td><strong>${tag}</strong></td><td>${value}</td></tr>`,
            );
          }
        }
        info.push("</table></details>");
      } else {
        info.push("<p>" + t('error.noMetadata') + "</p>");
      }

      // Use a container div with proper spacing instead of <br> separators
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-direction: column; gap: 4px;';
      
      // Add each info item as a separate element
      for (const item of info) {
        // Check if item contains block-level HTML
        if (item.includes('<details>') || item.includes('<table>') || item.includes('<h') || item.includes('<p>')) {
          // For block-level content, use innerHTML directly
          const wrapper = document.createElement('div');
          wrapper.innerHTML = item;
          container.appendChild(wrapper);
        } else {
          // For inline content, use a paragraph or div
          const wrapper = document.createElement('div');
          wrapper.innerHTML = item;
          container.appendChild(wrapper);
        }
      }
      
      details.innerHTML = '';
      details.appendChild(container);
    } catch (error) {
      console.error("Error processing EXIF data:", error);
      details.innerHTML =
        info.join("<br>") + "<p>" + t('error.exifProcessing') + "</p>";
    }
  });
}


/**
 * Show file modal for text/code files
 * @param {Object} file - File data
 */
async function showFileModal(file) {
  const modal = document.getElementById("fileModal");
  const modalTitle = document.getElementById("fileModalTitle");
  const modalBody = document.getElementById("fileModalBody");
  const downloadBtn = document.getElementById("fileDownloadBtn");

  modalTitle.textContent = file.name;
  downloadBtn.href = file.path;
  downloadBtn.download = file.name;

  // Show loading indicator
  modalBody.innerHTML =
    '<div class="loading-container"><div class="spinner"></div><p>' + t('loading.file') + '</p></div>';
  modal.style.display = "flex";

  try {
    const response = await fetch(file.path);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const text = await response.text();

    if (file.extension === "md") {
      // Render markdown
      const contentDiv = document.createElement("div");
      contentDiv.className = "markdown-content";
      contentDiv.innerHTML = marked.parse(text);
      modalBody.innerHTML = "";
      modalBody.appendChild(contentDiv);
    } else {
      // Render code with syntax highlighting
      const pre = document.createElement("pre");
      const code = document.createElement("code");

      // Map file extensions to Prism language classes
      const langMap = {
        js: "javascript",
        py: "python",
        rb: "ruby",
        go: "go",
        java: "java",
        c: "c",
        cpp: "cpp",
        cs: "csharp",
        php: "php",
        html: "html",
        css: "css",
        sh: "bash",
        rs: "rust",
        ts: "typescript",
        json: "json",
        xml: "xml",
        yaml: "yaml",
        yml: "yaml",
        sql: "sql",
        md: "markdown",
        swift: "swift",
        kt: "kotlin",
        dart: "dart",
        lua: "lua",
        r: "r",
      };

      const language = langMap[file.extension] || "text";
      code.className = `language-${language}`;
      code.textContent = text;

      pre.appendChild(code);
      modalBody.innerHTML = "";
      modalBody.appendChild(pre);

      // Apply syntax highlighting
      if (window.Prism) {
        window.Prism.highlightElement(code);
      }
    }
  } catch (error) {
    console.error("Error loading file:", error);
    modalBody.innerHTML = `<div class="error-container">
      <h3>${t('error.loadingFile')}</h3>
      <p>${error.message}</p>
    </div>`;
  }
}

/**
 * Hide modal
 * @param {string} modalId - ID of the modal to hide
 * @param {Event} event - Click event
 */
function hideModal(modalId, event) {
  if (event.target.id === modalId || event.target.classList.contains("modal")) {
    document.getElementById(modalId).style.display = "none";
  }
  // Stop video playback if video modal is closed
  if (modalId === "videoModal") {
    stopVideoPlayback();
  }
}

/**
 * Stop video playback and clear the video source when modal is closed
 * Prevents memory leaks by ensuring the video element doesn't retain references to large video files
 */
function stopVideoPlayback() {
  const videoPlayer = document.getElementById("modalVideo");
  if (videoPlayer) {
    videoPlayer.pause();
    videoPlayer.src = ""; // Clear source to free memory
  }
}
