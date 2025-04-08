/**
 * Main initialization and state management
 */

// Global state variables
let data = new Map(); // Use Map instead of array for better memory management
let index = 0; // Current overall index across all loaded pages
let currentPage = 1;
let totalPages = 1;
let filesPerPage = 1000; // Default, will be updated from meta.json
let type = "";
let modalIndex = -1;
let detailsVisible = false;
let loadingMore = false;
let endReached = false;
let imageObserver;
let currentAudio = null;
let resizeObserver;
let thumbnailsEnabled = false;
let debugLogging = false;
let currentZoom = "md"; // Default zoom level: xs, sm, md, lg, xl
const zoomLevels = ["xs", "sm", "md", "lg", "xl"];
var thumbnailCache = {};
var sharedThumbnails = {}; // Global cache of loaded thumbnails
var firstThumbnailForSeries = {}; // Track the first thumbnail for each video series

// Initialize application when DOM is loaded
window.addEventListener("DOMContentLoaded", function () {
  thumbnailsEnabled =
    document.body.getAttribute("data-thumbnails-enabled") === "true";
  debugLogging = document.body.getAttribute("data-debug-enabled") === "true";
  window.debugLog = function (message, ...args) {
    if (debugLogging) {
      console.debug("[DEBUG]", message, ...args);
    }
  };
  initApp();
});

/**
 * Initialize the application
 */
function initApp() {
  // Fetch file statistics
  fetchAllStats().then(() => {
    updateNavigation();
  });

  // Set up observers
  setupImageObserver();
  setupResizeObserver();

  // Initialize zoom level
  initializeZoomLevel();

  // Set up key event listeners
  setupKeyboardNavigation();

  // Set up scroll event
  setupInfiniteScroll();
}

/**
 * Initialize zoom level from localStorage or default
 */
function initializeZoomLevel() {
  const container = document.getElementById("container");

  // Get saved preference or use default
  const savedZoom = localStorage.getItem("preferredZoom");
  if (savedZoom && zoomLevels.includes(savedZoom)) {
    currentZoom = savedZoom;
  } else {
    // If no saved preference, explicitly set the default
    currentZoom = "md";
    localStorage.setItem("preferredZoom", currentZoom);
  }

  // Apply zoom class
  container.classList.add("zoom-" + currentZoom);

  // Update buttons state
  updateZoomButtons();
}

/**
 * Set up keyboard navigation
 */
function setupKeyboardNavigation() {
  window.addEventListener("keydown", function (e) {
    // Escape key - close modals
    if (e.key === "Escape") {
      document.getElementById("imageModal").style.display = "none";
      document.getElementById("fileModal").style.display = "none";
      document.getElementById("videoModal").style.display = "none";
    }

    // Arrow keys - navigate images when image modal is open
    if (document.getElementById("imageModal").style.display === "flex") {
      if (e.key === "ArrowRight") navigateModal(1);
      else if (e.key === "ArrowLeft") navigateModal(-1);
    }
  });
}

/**
 * Set up infinite scroll
 */
function setupInfiniteScroll() {
  window.onscroll = function () {
    if (loadingMore || endReached) return;

    // Check if user is near the bottom
    if (
      window.innerHeight + window.scrollY >=
      document.body.offsetHeight - 500 // Increased threshold slightly
    ) {
      loadPage(currentPage + 1); // Load the next page
    }
  };
}

/**
 * Set up image lazy loading with IntersectionObserver
 */
function setupImageObserver() {
  // Check if IntersectionObserver is supported
  if ("IntersectionObserver" in window) {
    imageObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;

            if (src) {
              img.src = src;
              img.removeAttribute("data-src");
              observer.unobserve(img);
            }
          }
        });
      },
      {
        rootMargin: "200px 0px", // Start loading when within 200px of viewport
        threshold: 0.01,
      },
    );
  }
}

/**
 * Set up ResizeObserver for layout adjustments
 */
function setupResizeObserver() {
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver((entries) => {
      const container = document.getElementById("container");

      // Only apply minimal changes to trigger reflow without visible disruption
      if (container) {
        // Apply a minimal style change that forces reflow but doesn't visually disrupt
        container.style.minHeight = container.offsetHeight + "px";

        // Remove the forced minHeight after a short delay
        setTimeout(() => {
          container.style.minHeight = "";
        }, 50);
      }
    });
  }
}

/**
 * Load the first page of a category
 * @param {string} t - Category type to load
 */
async function loadCategory(t) {
  type = t;
  index = 0;
  currentPage = 1;
  data.clear(); // Clear previous data
  endReached = false;
  loadingMore = false; // Reset loading flag

  updateActiveNav(t);
  document.getElementById("intro").style.display = "none";
  document.body.setAttribute("data-category", t);

  const container = document.getElementById("container");
  container.innerHTML = ""; // Clear container
  container.className = "container"; // Reset classes

  // Get pagination info for this type from allFileStats (loaded by fetchAllStats)
  const stats = allFileStats[t];
  if (!stats || stats.totalFiles === 0) {
    totalPages = 0;
    filesPerPage = 0;
    container.innerHTML = `<p>No files found in the '${t}' category.</p>`;
    endReached = true;
    return; // Nothing to load
  }

  totalPages = stats.totalPages;
  filesPerPage = stats.filesPerPage;

  // Setup initial view (table or card)
  if (shouldUseTableView(t)) {
    const table = createTableStructure(t);
    container.appendChild(table);
    const tbody = table.querySelector("tbody");
    tbody.innerHTML = `
          <tr class="loading-placeholder">
              <td colspan="${t === "audio" ? 4 : 3}" class="loading-container">
                  <div class="spinner"></div> <p>Loading files...</p>
              </td>
          </tr>
      `;
  } else {
    setupCardView(container, t);
    container.innerHTML =
      '<div class="loading-container loading-placeholder"><div class="spinner"></div><p>Loading files...</p></div>';
  }

  // Load the first page
  await loadPage(1);
}

/**
 * Load a specific page of files for the current category
 * @param {number} pageNum - The page number to load
 */
async function loadPage(pageNum) {
  if (loadingMore || pageNum > totalPages) {
    endReached = true;
    // Remove any final loading indicator if it exists
    const loadingPlaceholder = document.querySelector(".loading-placeholder");
    if (loadingPlaceholder) loadingPlaceholder.remove();
    return;
  }

  loadingMore = true;
  console.log(`Loading page ${pageNum} for type ${type}`);

  const container = document.getElementById("container");
  const loadingPlaceholder = document.querySelector(".loading-placeholder");

  try {
    const jsonPath = `${type}_${pageNum}.json`;
    const response = await fetch(jsonPath);

    if (!response.ok) {
      // Handle 404 for the specific page (might happen with fallback logic)
      if (response.status === 404 && allFileStats[type]?.isLegacy) {
        console.warn(`Legacy file ${type}.json not found or empty.`);
        endReached = true;
      } else {
        throw new Error(`HTTP error ${response.status} fetching ${jsonPath}`);
      }
      if (loadingPlaceholder) loadingPlaceholder.remove();
      loadingMore = false;
      return; // Stop loading this page
    }

    const files = await response.json();

    // Remove loading placeholder before rendering
    if (loadingPlaceholder) loadingPlaceholder.remove();

    if (files.length > 0) {
      // Store files in the Map (using current index as part of key for uniqueness if needed, or just path)
      files.forEach((file, i) => {
        data.set(index + i, file); // Use running index as key
      });

      // Render the newly loaded files
      renderPage(files);
      currentPage = pageNum;
    } else {
      endReached = true;
      console.log("Reached end, no more files in page", pageNum);
    }

    loadingMore = false;

    // Check if we need to load *more* pages immediately (if viewport isn't full)
    // Use a small delay to allow rendering to complete
    setTimeout(checkForMoreContent, 100);
  } catch (error) {
    console.error(`Error loading page ${pageNum} for ${type}:`, error);
    if (loadingPlaceholder) loadingPlaceholder.remove();
    container.innerHTML += `<div class="error-container">
      <h3>Error Loading Page ${pageNum}</h3>
      <p>${error.message}</p>
      <button onclick="loadPage(${pageNum})">Try Again</button>
    </div>`;
    loadingMore = false;
    endReached = true; // Stop trying to load more on error
  }
}

/**
 * Render a specific page/batch of files
 * @param {Array<FileInfo>} filesToRender - The files to append to the view
 */
function renderPage(filesToRender) {
  if (!filesToRender || filesToRender.length === 0) {
    return;
  }

  const container = document.getElementById("container");
  const isTableView = shouldUseTableView(type);
  const startIndex = index; // Keep track of starting index for this batch

  if (isTableView) {
    const tbody = container.querySelector("tbody");
    if (tbody) {
      // Ensure tbody exists
      renderTableView(tbody, filesToRender, startIndex);
    } else {
      console.error("Table body not found for rendering!");
    }
  } else {
    renderCardView(container, filesToRender, startIndex);
  }

  // Update the main index *after* rendering this batch
  index += filesToRender.length;
}

/**
 * Check if more content needs to be loaded (loads next page if needed)
 */
function checkForMoreContent() {
  if (loadingMore || endReached) return;

  const viewportHeight = window.innerHeight;
  const documentHeight = document.body.offsetHeight;
  const scrollPosition = window.scrollY;

  // Load *next page* if not enough content to fill viewport or close to bottom
  if (
    documentHeight < viewportHeight * 1.5 ||
    scrollPosition + viewportHeight > documentHeight - 500
  ) {
    // We don't call render directly anymore, we call loadPage
    loadPage(currentPage + 1);
  }
}
