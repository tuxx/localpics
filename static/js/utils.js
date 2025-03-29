/**
 * Utility functions for Media Viewer
 */

/**
 * Format file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

/**
 * Get appropriate icon for file type based on extension
 * @param {string} extension - File extension
 * @returns {string} Icon character
 */
function getFileIcon(extension) {
  const iconMap = {
    pdf: "📄",
    zip: "🗜️",
    rar: "🗜️",
    "7z": "🗜️",
    gz: "🗜️",
    tgz: "🗜️",
    py: "🐍",
    js: "📜",
    html: "🌐",
    css: "🎨",
    go: "🐹",
    java: "☕",
    c: "🔧",
    cpp: "🔧",
    rs: "🦀",
    txt: "📝",
    md: "📝",
  };

  return iconMap[extension] || "📄";
}

/**
 * Get a default aspect ratio for images
 * @returns {string} Default aspect ratio
 */
function getImageAspectRatio() {
  return "3/2"; // Common aspect ratio for photos (landscape orientation)
}

/**
 * Scroll to top of the page with smooth animation
 */
function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

/**
 * Zoom in view (decrease column count)
 */
function zoomIn() {
  const currentIndex = zoomLevels.indexOf(currentZoom);
  if (currentIndex < zoomLevels.length - 1) {
    setZoom(zoomLevels[currentIndex + 1]);
  }
  updateZoomButtons();
}

/**
 * Zoom out view (increase column count)
 */
function zoomOut() {
  const currentIndex = zoomLevels.indexOf(currentZoom);
  if (currentIndex > 0) {
    setZoom(zoomLevels[currentIndex - 1]);
  }
  updateZoomButtons();
}

/**
 * Set zoom level and apply appropriate CSS class
 * @param {string} level - Zoom level (xs, sm, md, lg, xl)
 */
function setZoom(level) {
  const container = document.getElementById("container");

  // Remove all zoom classes
  container.classList.remove(
    "zoom-xs",
    "zoom-sm",
    "zoom-md",
    "zoom-lg",
    "zoom-xl",
  );

  // Add the new zoom class
  container.classList.add("zoom-" + level);

  // Update current zoom
  currentZoom = level;

  // Save preference to localStorage
  localStorage.setItem("preferredZoom", level);

  // Check if we need to load more content after zooming out
  setTimeout(checkForMoreContent, 100);
}

/**
 * Update the state of zoom buttons
 */
function updateZoomButtons() {
  const currentIndex = zoomLevels.indexOf(currentZoom);
  const zoomInBtn = document.querySelector('a[onclick="zoomIn()"]');
  const zoomOutBtn = document.querySelector('a[onclick="zoomOut()"]');

  // Disable zoom in at maximum zoom level
  if (currentIndex >= zoomLevels.length - 1) {
    zoomInBtn.classList.add("disabled");
    zoomInBtn.style.pointerEvents = "none";
  } else {
    zoomInBtn.classList.remove("disabled");
    zoomInBtn.style.pointerEvents = "auto";
  }

  // Disable zoom out at minimum zoom level
  if (currentIndex <= 0) {
    zoomOutBtn.classList.add("disabled");
    zoomOutBtn.style.pointerEvents = "none";
  } else {
    zoomOutBtn.classList.remove("disabled");
    zoomOutBtn.style.pointerEvents = "auto";
  }
}
