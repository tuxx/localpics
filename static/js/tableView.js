/**
 * Table view functionality
 */

/**
 * Determine if a file type should use table view instead of cards
 * @param {string} fileType - Type of file
 * @returns {boolean} True if table view should be used
 */
function shouldUseTableView(fileType) {
  return ["audio", "archive", "other"].includes(fileType);
}

/**
 * Create the table structure for table view categories
 * @param {string} fileType - Type of file
 * @returns {HTMLElement} Table element
 */
function createTableStructure(fileType) {
  const table = document.createElement("table");
  table.className = "file-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");

  // Common headers for all table views
  headerRow.innerHTML = `
    <th>📥 Filename</th>
    <th>Size</th>
    <th>Modified</th>
  `;

  // Add play column for audio files
  if (fileType === "audio") {
    headerRow.innerHTML += `<th>Play</th>`;
  }

  thead.appendChild(headerRow);
  table.appendChild(thead);

  // Create tbody for the content
  const tbody = document.createElement("tbody");
  table.appendChild(tbody);

  return table;
}

/**
 * Create a table row for a file
 * @param {Object} file - File data
 * @param {number} i - File index
 * @returns {HTMLElement} Table row element
 */
function createTableRow(file, i) {
  const row = document.createElement("tr");

  // Create file name cell with download link
  const nameCell = document.createElement("td");
  const downloadLink = document.createElement("a");
  downloadLink.href = file.path;
  downloadLink.download = file.name;
  downloadLink.innerHTML = `<span class="download-icon">📥</span> ${file.name}`;
  downloadLink.className = "table-file-link";
  nameCell.appendChild(downloadLink);

  // Create size cell
  const sizeCell = document.createElement("td");
  sizeCell.textContent = formatFileSize(file.size);

  // Create modified date cell
  const dateCell = document.createElement("td");
  dateCell.textContent = new Date(file.modified).toLocaleString();

  // Add cells to row
  row.appendChild(nameCell);
  row.appendChild(sizeCell);
  row.appendChild(dateCell);

  // Add play button for audio files
  if (file.type === "audio") {
    const playCell = document.createElement("td");
    const playButton = document.createElement("button");
    playButton.className = "play-button";
    playButton.innerHTML = "▶️";
    playButton.setAttribute("data-src", file.path);
    playButton.setAttribute("data-playing", "false");
    playButton.onclick = function () {
      playAudio(this, file.path);
    };
    playCell.appendChild(playButton);
    row.appendChild(playCell);
  }

  return row;
}

/**
 * Play/pause audio in table view
 * @param {HTMLElement} button - Play button
 * @param {string} src - Audio file source
 */
function playAudio(button, src) {
  const isPlaying = button.getAttribute("data-playing") === "true";

  // If we have a currently playing audio, pause it first
  if (currentAudio) {
    currentAudio.pause();
    // Reset all play buttons
    document.querySelectorAll(".play-button").forEach((btn) => {
      btn.innerHTML = "▶️";
      btn.setAttribute("data-playing", "false");
    });
  }

  // If the clicked button was already playing, just stop and return
  if (isPlaying) {
    currentAudio = null;
    return;
  }

  // Create new audio object
  const audio = new Audio(src);

  // Update button state and play
  button.innerHTML = "⏸️";
  button.setAttribute("data-playing", "true");

  // Play the audio
  audio.play();
  currentAudio = audio;

  // Handle audio end
  audio.onended = function () {
    button.innerHTML = "▶️";
    button.setAttribute("data-playing", "false");
    currentAudio = null;
  };

  // Handle audio error
  audio.onerror = function () {
    button.innerHTML = "❌";
    setTimeout(() => {
      button.innerHTML = "▶️";
      button.setAttribute("data-playing", "false");
    }, 2000);
    currentAudio = null;
  };
}

/**
 * Render content in table view
 * @param {HTMLElement} tbody - Table body element
 * @param {Array} slice - Slice of data to render
 * @param {number} startIndex - Starting index for the slice
 */
function renderTableView(tbody, slice, startIndex) {
  for (let i = 0; i < slice.length; i++) {
    const file = slice[i];
    const row = createTableRow(file, startIndex + i);
    tbody.appendChild(row);
  }
}
