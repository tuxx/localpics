/**
 * Main initialization and state management
 */

// Global state variables
let data = [];
let index = 0;
let step = 50;
let type = "";
let modalIndex = -1;
let detailsVisible = false;
let loadingMore = false;
let allFileStats = {};
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
      window.debugLog("[DEBUG]", message, ...args);
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

    if (
      window.innerHeight + window.scrollY >=
      document.body.offsetHeight - 200
    ) {
      loadingMore = true;
      render().then(() => {
        loadingMore = false;
      });
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
 * Check if more content needs to be loaded when there's not enough to fill the viewport
 */
function checkForMoreContent() {
  if (loadingMore || endReached) return;

  const viewportHeight = window.innerHeight;
  const documentHeight = document.body.offsetHeight;
  const scrollPosition = window.scrollY;

  // Load more content if not enough to fill viewport or close to bottom
  if (
    documentHeight < viewportHeight * 1.5 ||
    scrollPosition + viewportHeight > documentHeight - 500
  ) {
    loadingMore = true;
    render().then(() => {
      loadingMore = false;

      // If we're still not filling the viewport and have more content, keep loading
      if (!endReached && documentHeight < viewportHeight * 1.5) {
        setTimeout(checkForMoreContent, 100);
      }
    });
  }
}
