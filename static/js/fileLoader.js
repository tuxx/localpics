/**
 * File loading and data handling
 */

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
    '<div class="loading-container"><div class="spinner"></div><p>Loading file statistics...</p></div>';

  try {
    const results = await Promise.allSettled(
      types.map(async (t) => {
        try {
          const response = await fetch(t + ".json");
          if (!response.ok) throw new Error(`HTTP error ${response.status}`);
          const json = await response.json();
          return { type: t, count: json.length };
        } catch (error) {
          console.warn(`Could not fetch stats for ${t}:`, error);
          return { type: t, count: 0, error: true };
        }
      }),
    );

    allFileStats = results.reduce((acc, result) => {
      if (result.status === "fulfilled") {
        acc[result.value.type] = result.value;
      }
      return acc;
    }, {});

    displayFileStats();
    return allFileStats;
  } catch (error) {
    statsContainer.innerHTML = `<div class="error-container">Failed to load file statistics: ${error.message}</div>`;
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
      "<p>No file statistics available.</p>";
    return;
  }

  const totalCount = Object.values(allFileStats).reduce(
    (sum, stat) => sum + (stat.count || 0),
    0,
  );

  let html = `
    <h3>File Statistics</h3>
    <table class="file-table">
      <thead>
        <tr>
          <th>Type</th>
          <th>Count</th>
          <th>Percentage</th>
        </tr>
      </thead>
      <tbody>
  `;

  types.forEach((type) => {
    const stat = allFileStats[type];
    if (!stat.error) {
      const percentage =
        totalCount > 0 ? ((stat.count / totalCount) * 100).toFixed(1) : 0;
      html += `
        <tr>
          <td>${type.charAt(0).toUpperCase() + type.slice(1)}</td>
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
          <td><strong>Total</strong></td>
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
        <p>Loading files...</p>
      </td>
    `;
    tbody.appendChild(loadingRow);
  } else {
    // Handle card views
    setupCardView(container, t);
  }

  try {
    const response = await fetch(t + ".json");
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
      <h3>Error Loading Files</h3>
      <p>${error.message}</p>
      <button onclick="load('${t}')">Try Again</button>
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
