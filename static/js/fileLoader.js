/**
 * File loading and data handling
 */

// Current album ID (empty for single-album mode)
let currentAlbumId = "";

/**
 * Load album list and create selector
 * @returns {Promise<boolean>} True if multi-album mode is active
 */
async function loadAlbums() {
  try {
    const response = await fetch('/api/albums');
    if (!response.ok) {
      // Single-album mode, hide selector
      document.getElementById('albumSelectorContainer').style.display = 'none';
      return false;
    }
    const albums = await response.json();
    if (!albums || albums.length === 0) {
      document.getElementById('albumSelectorContainer').style.display = 'none';
      return false;
    }

    // Show and populate selector
    const container = document.getElementById('albumSelectorContainer');
    container.style.display = 'inline-block';

    const selector = document.getElementById('albumSelector');
    selector.innerHTML = '';
    albums.forEach((album) => {
      const option = document.createElement('option');
      option.value = album.id;
      option.textContent = album.name || `Album ${album.id}`;
      selector.appendChild(option);
    });

    // Set default to first album
    currentAlbumId = albums[0].id;
    selector.value = currentAlbumId;

    // Handle album switch
    selector.addEventListener('change', function() {
      currentAlbumId = this.value;
      // Refresh statistics for new album
      if (document.getElementById('intro').style.display !== 'none') {
        fetchAllStats();
      }
      // Refresh current view
      if (type) {
        load(type);
      } else {
        showIntro();
      }
    });

    return true;
  } catch (error) {
    console.warn('Failed to load albums:', error);
    document.getElementById('albumSelectorContainer').style.display = 'none';
    return false;
  }
}
// Expose loadAlbums globally
window.loadAlbums = loadAlbums;

/**
 * Get the base path for JSON files based on current album
 * @param {string} category - File category (image, video, etc.)
 * @returns {string} URL path for the JSON file
 */
function getJsonPath(category) {
  if (currentAlbumId) {
    return `albums/${currentAlbumId}/${category}.json`;
  }
  return `${category}.json`;
}

/**
 * Update navigation based on file counts
 */
function updateNavigation() {
  const types = [
    "image",
    "video",
    "audio",
    "text",
    "code",
    "pdf",
    "archive",
    "other",
  ];

  types.forEach((type) => {
    const stat = allFileStats[type];
    const navItem = document.querySelector(`a[data-category="${type}"]`);

    if (navItem) {
      // Hide nav items with zero files
      if (stat && stat.count === 0) {
        navItem.style.display = "none";
      } else {
        navItem.style.display = "inline-block";
      }
    }
  });
}

/**
 * Show home view with statistics
 */
function showIntro() {
  updateActiveNav("home");
  document.getElementById("intro").style.display = "block";
  document.getElementById("container").innerHTML = "";
}

/**
 * Update active navigation item
 * @param {string} category - Category to set as active
 */
function updateActiveNav(category) {
  document.querySelectorAll("#navbar a").forEach((a) => {
    a.classList.remove("active");
    if (a.dataset.category === category) {
      a.classList.add("active");
    }
  });
}

/**
 * Fetch statistics for all file types
 * @returns {Promise<Object>} Statistics for each file type
 */
async function fetchAllStats() {
  const types = [
    "image",
    "video",
    "audio",
    "text",
    "code",
    "pdf",
    "archive",
    "other",
  ];
  const statsContainer = document.getElementById("fileStats");
  statsContainer.innerHTML =
    '<div class="loading-container"><div class="spinner"></div><p>' + t('stats.loading') + '</p></div>';

  try {
    const results = await Promise.allSettled(
      types.map(async (t) => {
        try {
          const url = getJsonPath(t);
          const response = await fetch(url);
          if (!response.ok) {
            // Just return zero count rather than throwing an error
            return { type: t, count: 0 };
          }
          const json = await response.json();
          return { type: t, count: json.length };
        } catch (error) {
          console.warn(`Could not fetch stats for ${t}:`, error);
          return { type: t, count: 0, error: true };
        }
      }),
    );

    // Rest of the function remains the same
    allFileStats = results.reduce((acc, result) => {
      if (result.status === "fulfilled") {
        acc[result.value.type] = result.value;
      }
      return acc;
    }, {});

    displayFileStats();
    return allFileStats;
  } catch (error) {
    statsContainer.innerHTML = `<div class="error-container">${t('error.loadingFileStats', {error: error.message})}</div>`;
    return {};
  }
}
/**
 * Display file statistics in a table
 */
function displayFileStats() {
  const types = Object.keys(allFileStats);
  if (types.length === 0) {
    document.getElementById("fileStats").innerHTML =
      "<p>" + t('stats.noData') + "</p>";
    return;
  }

  const totalCount = Object.values(allFileStats).reduce(
    (sum, stat) => sum + (stat.count || 0),
    0,
  );

  // Get current album name
  const selector = document.getElementById('albumSelector');
  let albumName = '';
  if (selector && selector.selectedIndex >= 0) {
    albumName = selector.options[selector.selectedIndex]?.text || '';
  }
  const titleSuffix = albumName ? ` (${albumName})` : '';

  let html = `
    <h3>${t('stats.title')}${titleSuffix}</h3>
    <table class="file-table">
      <thead>
        <tr>
          <th>${t('stats.type')}</th>
          <th>${t('stats.count')}</th>
          <th>${t('stats.percentage')}</th>
        </tr>
      </thead>
      <tbody>
  `;

  types.forEach((type) => {
    const stat = allFileStats[type];
    if (!stat.error) {
      const percentage =
        totalCount > 0 ? ((stat.count / totalCount) * 100).toFixed(1) : 0;
      // Map type to localized category name
      const typeKey = `category.${type}`;
      const displayName = t(typeKey) || type.charAt(0).toUpperCase() + type.slice(1);
      html += `
        <tr>
          <td>${displayName}</td>
          <td>${stat.count}</td>
          <td>${percentage}%</td>
        </tr>
      `;
    }
  });

  html += `
      </tbody>
      <tfoot>
        <tr>
          <td><strong>${t('stats.total')}</strong></td>
          <td><strong>${totalCount}</strong></td>
          <td>100%</td>
        </tr>
      </tfoot>
    </table>
  `;

  document.getElementById("fileStats").innerHTML = html;
}

/**
 * Load a category of files
 * @param {string} t - Category type to load
 */
async function load(t) {
  type = t;
  index = 0;
  data = [];
  endReached = false;
  updateActiveNav(t);
  document.getElementById("intro").style.display = "none";

  // Set data attribute on body for CSS targeting
  document.body.setAttribute("data-category", t);

  const container = document.getElementById("container");
  container.innerHTML = ""; // Clear container
  container.className = "container"; // Reset classes

  // Check if this type should use table view
  if (shouldUseTableView(t)) {
    // Create and append table structure
    const table = createTableStructure(t);
    container.appendChild(table);

    // Add loading row to the table
    const tbody = table.querySelector("tbody");
    const loadingRow = document.createElement("tr");
    loadingRow.innerHTML = `
      <td colspan="${t === "audio" ? 4 : 3}" class="loading-container">
        <div class="spinner"></div>
        <p>${t('loading.files')}</p>
      </td>
    `;
    tbody.appendChild(loadingRow);
  } else {
    // Handle card views
    setupCardView(container, t);
  }

  try {
    const url = getJsonPath(t);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);
    data = await response.json();

    if (shouldUseTableView(t)) {
      // Clear the loading indicator for table view
      const tbody = container.querySelector("tbody");
      tbody.innerHTML = "";
    } else {
      // Clear the loading indicator for card view
      container.innerHTML = "";
    }

    await render().then(() => {
      // Check if we need to load more content based on viewport
      checkForMoreContent();
    });
  } catch (error) {
    container.innerHTML = `<div class="error-container">
      <h3>${t('error.loadingFiles')}</h3>
      <p>${error.message}</p>
      <button onclick="load('${t}')">${t('error.tryAgain')}</button>
    </div>`;
  }
}

/**
 * Setup card view with appropriate classes and zoom level
 * @param {HTMLElement} container - Container element
 * @param {string} t - File type
 */
function setupCardView(container, t) {
  // Apply grid layout based on content type
  if (t === "text" || t === "code") {
    container.classList.add("grid-2");
  } else if (t === "pdf") {
    container.classList.add("grid-1");
  } else {
    container.classList.add("grid-4");
  }

  // Add zoom class
  container.classList.add("zoom-" + currentZoom);

  // Show loading indicator for card view
  container.innerHTML =
    '<div class="loading-container"><div class="spinner"></div><p>Loading files...</p></div>';

  // Update zoom buttons state
  updateZoomButtons();
}
/**
 * Render files
 * @returns {Promise<boolean>} True if render was successful
 */
async function render() {
  if (data.length === 0 || index >= data.length) {
    endReached = true;
    return false;
  }

  const container = document.getElementById("container");
  const slice = data.slice(index, index + step);
  const isTableView = shouldUseTableView(type);

  if (isTableView) {
    // Table view rendering
    const tbody = container.querySelector("tbody");
    renderTableView(tbody, slice, index);
  } else {
    // Card view rendering
    renderCardView(container, slice, index);
  }

  index += step;
  return true;
}
