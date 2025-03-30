/**
 * Card view functionality
 */

/**
 * Create a card element for a file
 * @param {Object} file - File data
 * @param {number} i - Index of the file
 * @param {number} startIndex - Starting index for the slice
 * @returns {HTMLElement} Card element
 */
function createCardElement(file, i, startIndex) {
  const div = document.createElement("div");
  div.className = "file-card";

  // Add file name and date/size info
  div.innerHTML = `
    <div class="name">${file.name}</div>
    <div class="info">
      Size: ${formatFileSize(file.size)} •
      Modified: ${new Date(file.modified).toLocaleString()}
    </div>
  `;

  // Handle different file types
  switch (file.type) {
    case "image":
      appendImageContent(div, file, startIndex + i);
      break;
    case "video":
      appendVideoContent(div, file, startIndex + i);
      break;
    case "audio":
      div.innerHTML += `<audio controls src="${file.path}" preload="metadata"></audio>`;
      break;
    case "pdf":
      div.innerHTML += `<iframe src="${file.path}" title="${file.name}"></iframe>`;
      break;
    case "code":
    case "text":
      appendTextContent(div, file);
      break;
    default:
      // Archive and other files
      appendOtherContent(div, file);
      break;
  }

  return div;
}

/**
 * Append image content to a card
 * @param {HTMLElement} div - Card element
 * @param {Object} file - File data
 * @param {number} imageIndex - Index for the image
 */
function appendImageContent(div, file, imageIndex) {
  const imageContainer = document.createElement("div");
  imageContainer.className = "image-container";

  // Set a fixed aspect ratio for the container to prevent layout shifts
  const aspectRatio = getImageAspectRatio(file);
  imageContainer.style.aspectRatio = aspectRatio;

  // Add loading placeholder
  const placeholder = document.createElement("div");
  placeholder.className = "placeholder";
  placeholder.innerHTML = '<div class="spinner"></div>';
  imageContainer.appendChild(placeholder);

  // Create image with improved loading
  const img = document.createElement("img");
  img.style.opacity = "0"; // Start hidden
  img.setAttribute("loading", "lazy");
  img.dataset.src = file.path; // Store path but don't load immediately

  // Set click handler
  img.onclick = function () {
    showImageModal(imageIndex);
  };

  // Add load event handler
  img.onload = function () {
    // Use a fade-in transition
    placeholder.style.display = "none";

    // Apply a smooth transition for the opacity
    img.style.transition = "opacity 0.3s ease";
    img.style.opacity = "1";

    // Only observe for a very short time to minimize disruption
    if (resizeObserver) {
      resizeObserver.observe(imageContainer);
      setTimeout(() => {
        resizeObserver.unobserve(imageContainer);
      }, 50); // Shorter time to reduce impact
    }
  };

  // Add error handler
  img.onerror = function () {
    placeholder.innerHTML = "❌ Error loading image";
  };

  imageContainer.appendChild(img);
  div.appendChild(imageContainer);

  // Use the observer if available, otherwise fallback to setTimeout
  if (imageObserver) {
    imageObserver.observe(img);
  } else {
    setTimeout(() => {
      img.src = img.dataset.src;
    }, 10);
  }
}

/**
 * Append text/code content to a card
 * @param {HTMLElement} div - Card element
 * @param {Object} file - File data
 */
function appendTextContent(div, file) {
  // Add preview icon
  div.innerHTML += `<div class="file-icon">${getFileIcon(file.extension)}</div>`;

  // Add preview/download buttons
  const actions = document.createElement("div");

  const viewLink = document.createElement("a");
  viewLink.className = "view-full";
  viewLink.innerText = "View Full File";
  viewLink.onclick = function () {
    showFileModal(file);
  };
  actions.appendChild(viewLink);

  const downloadLink = document.createElement("a");
  downloadLink.className = "download";
  downloadLink.href = file.path;
  downloadLink.download = file.name;
  downloadLink.innerText = "Download";
  actions.appendChild(downloadLink);

  div.appendChild(actions);

  // For code and text files, load a preview
  renderTextPreview(file, div);
}

/**
 * Append other file types (archives, etc.) content to a card
 * @param {HTMLElement} div - Card element
 * @param {Object} file - File data
 */
function appendOtherContent(div, file) {
  div.innerHTML += `<div class="file-icon">${getFileIcon(file.extension)}</div>`;
  const downloadLink = document.createElement("a");
  downloadLink.className = "download-button";
  downloadLink.href = file.path;
  downloadLink.download = file.name;
  downloadLink.innerHTML = "📥 Download File";
  div.appendChild(downloadLink);
}

/**
 * Render text preview with syntax highlighting
 * @param {Object} file - File data
 * @param {HTMLElement} div - Card element
 */
async function renderTextPreview(file, div) {
  try {
    const response = await fetch(file.path);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    const text = await response.text();

    // Limit preview to 30 lines or 3000 characters
    const contentPreview = text
      .split("\n")
      .slice(0, 30)
      .join("\n")
      .substring(0, 3000);
    const hasMore = text.length > contentPreview.length;

    const previewDiv = document.createElement("div");

    if (file.extension === "md") {
      // Markdown preview
      previewDiv.className = "text-preview";
      previewDiv.innerHTML = marked.parse(contentPreview);
      if (hasMore)
        previewDiv.innerHTML += "<p><em>... (content truncated)</em></p>";
    } else {
      // Code preview with syntax highlighting
      const pre = document.createElement("pre");
      pre.className = "code-preview";
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
      code.textContent = contentPreview;

      if (hasMore) {
        const more = document.createElement("div");
        more.style.textAlign = "center";
        more.style.padding = "5px";
        more.style.color = "#666";
        more.innerText = "... (content truncated)";
        pre.appendChild(code);
        pre.appendChild(more);
      } else {
        pre.appendChild(code);
      }

      previewDiv.appendChild(pre);

      // Apply syntax highlighting
      if (window.Prism) {
        window.Prism.highlightElement(code);
      }
    }

    div.appendChild(previewDiv);
  } catch (error) {
    console.error("Error loading file preview:", error);
    const errorMsg = document.createElement("div");
    errorMsg.className = "error-container";
    errorMsg.innerText = `Failed to load preview: ${error.message}`;
    div.appendChild(errorMsg);
  }
}

/**
 * Render content in card view
 * @param {HTMLElement} container - Container element
 * @param {Array} slice - Slice of data to render
 * @param {number} startIndex - Starting index for the slice
 */
function renderCardView(container, slice, startIndex) {
  for (let i = 0; i < slice.length; i++) {
    const file = slice[i];
    const div = createCardElement(file, i, startIndex);
    container.appendChild(div);
  }
}

/**
 * Append video content to a card with a placeholder instead of embedding video directly
 * @param {HTMLElement} div - Card element
 * @param {Object} file - File data
 * @param {number} videoIndex - Index for the video
 */
function appendVideoContent(div, file, videoIndex) {
  // Create container
  const videoContainer = document.createElement("div");
  videoContainer.className = "video-container";

  // Create a visually pleasing placeholder
  const placeholder = document.createElement("div");
  placeholder.className = "video-placeholder";

  // Extract name without extension for display
  const fileName = file.name.split(".").slice(0, -1).join(".");

  // Create a color based on the file name for visual variety
  const hue = generateConsistentHue(fileName);
  placeholder.style.backgroundColor = `hsl(${hue}, 75%, 25%)`;

  placeholder.innerHTML = `
    <div class="video-size-badge">${formatFileSize(file.size)}</div>
    <div class="video-name-overlay">${fileName}</div>
    <div class="video-play-button">▶</div>
    <div class="video-info">Click to play</div>
  `;

  // Debug the thumbnail status
  window.debugLog("Thumbnails enabled:", thumbnailsEnabled);

  // Only try to load thumbnails if enabled on the server
  if (thumbnailsEnabled) {
    // Extract the video series name (e.g., "BigBuckBunny" from "BigBuckBunny-1280x720.mp4")
    const fileBaseName = file.name.split(".")[0]; // Remove extension
    const seriesMatch = fileBaseName.match(/^([A-Za-z]+)/);
    const seriesName = seriesMatch ? seriesMatch[1] : fileBaseName;

    // Get thumbnail URL for this specific video
    const videoPathEncoded = encodeURIComponent(file.path.substring(7));
    const thumbnailUrl = `/thumbnail/${videoPathEncoded}`;

    // Check if we already have a thumbnail for this series
    let useThumbnailUrl = thumbnailUrl;
    if (firstThumbnailForSeries[seriesName]) {
      // Use the first thumbnail from this series
      useThumbnailUrl = firstThumbnailForSeries[seriesName];
      window.debugLog(
        `Using shared thumbnail for ${seriesName} series:`,
        useThumbnailUrl,
      );
    } else {
      // This is the first video of this series - remember its thumbnail
      firstThumbnailForSeries[seriesName] = thumbnailUrl;
      window.debugLog(
        `First thumbnail for ${seriesName} series:`,
        thumbnailUrl,
      );
    }

    // Create and set up the thumbnail image
    const thumbnailImg = document.createElement("img");
    thumbnailImg.className = "video-thumbnail";
    thumbnailImg.alt = fileName;
    thumbnailImg.style.position = "absolute";
    thumbnailImg.style.top = "0";
    thumbnailImg.style.left = "0";
    thumbnailImg.style.width = "100%";
    thumbnailImg.style.height = "100%";
    thumbnailImg.style.objectFit = "cover";
    thumbnailImg.style.zIndex = "20";

    // Check if this shared URL is already loaded
    if (sharedThumbnails[useThumbnailUrl]) {
      // Use already loaded thumbnail immediately
      thumbnailImg.style.opacity = "0.85";
      thumbnailImg.src = useThumbnailUrl;
      placeholder.classList.add("loaded");
    } else {
      // First time loading this thumbnail
      thumbnailImg.style.opacity = "0";
      thumbnailImg.src = useThumbnailUrl;

      thumbnailImg.onload = function () {
        window.debugLog(`Thumbnail loaded for ${seriesName} series`);
        this.style.opacity = "0.85";
        placeholder.classList.add("loaded");

        // Mark this URL as successfully loaded
        sharedThumbnails[useThumbnailUrl] = true;
      };

      thumbnailImg.onerror = function () {
        console.error(`Thumbnail failed to load for ${seriesName} series`);
        placeholder.classList.add("loaded");
      };
    }

    placeholder.appendChild(thumbnailImg);
  } else {
    placeholder.classList.add("loaded");
  }

  // Set click handler to play video on demand
  placeholder.onclick = function () {
    showVideoModal(file, videoIndex);
  };

  videoContainer.appendChild(placeholder);
  div.appendChild(videoContainer);
}
/**
 * Generate a consistent hue from a string for color variety
 * @param {string} str - String to generate color from
 * @returns {number} Hue value (0-360)
 */
function generateConsistentHue(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash % 360;
}

/**
 * Show video modal for on-demand playback
 * @param {Object} file - File data
 * @param {number} videoIndex - Index of the video in data array
 */
function showVideoModal(file, videoIndex) {
  const modal = document.getElementById("videoModal");
  const videoPlayer = document.getElementById("modalVideo");

  // Set video source
  videoPlayer.src = file.path;
  document.getElementById("videoDownloadBtn").href = file.path;

  // Show file details
  document.getElementById("videoModalTitle").textContent = file.name;
  document.getElementById("videoModalSize").textContent = formatFileSize(
    file.size,
  );

  modal.style.display = "flex";

  // Auto-play when opened
  videoPlayer.play().catch((e) => window.debugLog("Autoplay prevented:", e));
}
