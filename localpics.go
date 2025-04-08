package main

import (
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"html/template"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"syscall"
	"time"
)

//go:embed template/index.html
var templateFS embed.FS

//go:embed static/css static/js
var staticFS embed.FS

// Version information
var (
	Version   = "dev"
	Commit    = "unknown"
	BuildDate = "unknown"
)

// FileInfo holds information about each file
type FileInfo struct {
	Name      string    `json:"name"`
	Path      string    `json:"path"`
	Size      int64     `json:"size"`
	Modified  time.Time `json:"modified"`
	Extension string    `json:"extension"`
	Type      string    `json:"type"`
}

// TemplateData holds data to pass to the template
type TemplateData struct {
	AllowDelete       bool
	Version           string
	ThumbnailsEnabled bool
	DebugLogging      bool
}

// Config holds the application configuration
type Config struct {
	InputDir       string `json:"input_dir"`
	OutputDir      string `json:"output_dir"`
	AllowDelete    bool   `json:"allow_delete"`
	Host           string `json:"host"`
	Recursive      bool   `json:"recursive"`
	Thumbnails     bool   `json:"thumbnails"`
	ThumbnailCache string `json:"thumbnail_cache"`
	PreGenerate    int    `json:"thumbnail_pregenerate"`
	DebugLog       bool   `json:"debug_log"`
}

// Debug loggin function
func debugLog(format string, v ...interface{}) {
	if debugLogging {
		log.Printf("[DEBUG] "+format, v...)
	}
}

// GetDefaultConfigPath returns the default location for the config file
// based on the operating system
func GetDefaultConfigPath() string {
	configName := "localpics.json"

	switch runtime.GOOS {
	case "windows":
		// Windows: %APPDATA%\localpics\config.json
		appData := os.Getenv("APPDATA")
		if appData == "" {
			appData = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Roaming")
		}
		return filepath.Join(appData, "localpics", configName)
	case "darwin":
		// macOS: ~/Library/Application Support/localpics/config.json
		home, _ := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", "localpics", configName)
	default:
		// Linux/Unix: ~/.config/localpics/config.json
		home, _ := os.UserHomeDir()
		return filepath.Join(home, ".config", "localpics", configName)
	}
}

func LoadConfig(configPath string) (*Config, error) {
	// Set default values
	config := &Config{
		InputDir:       "",
		OutputDir:      "",
		AllowDelete:    false,
		Host:           "localhost:8080",
		Recursive:      true,
		Thumbnails:     false,
		ThumbnailCache: "thumbnails",
		PreGenerate:    50,
		DebugLog:       false,
	}

	// Check if file exists
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		return config, nil // Return default config if file doesn't exist
	}

	// Read configuration file
	fileData, err := os.ReadFile(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	// Parse JSON
	if err := json.Unmarshal(fileData, config); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	return config, nil
}

func SaveConfig(config *Config, configPath string) error {
	// Create directory if it doesn't exist
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("failed to create config directory: %w", err)
	}

	// Marshal to JSON with indentation for readability
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to encode config: %w", err)
	}

	// Write to file
	if err := os.WriteFile(configPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write config file: %w", err)
	}

	fmt.Printf("Configuration saved to: %s\n", configPath)
	return nil
}

// categorizeFileType determines the media type based on file extension
func categorizeFileType(ext string) string {
	ext = strings.ToLower(ext)
	switch ext {
	case "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "jfif":
		return "image"
	case "mp4", "webm", "mkv", "mpeg", "3gp":
		return "video"
	case "mp3", "wav", "ogg", "flac", "aac", "opus":
		return "audio"
	case "pdf":
		return "pdf"
	case "txt", "md", "log":
		return "text"
	case "go", "py", "c", "cpp", "h", "js", "ts", "html", "css", "sh", "java", "rs", "gd":
		return "code"
	case "zip", "rar", "7z", "gz", "tgz":
		return "archive"
	default:
		return "other"
	}
}

const filesPerPage = 1000

// CategoryPageInfo tracks pagination for a category
type CategoryPageInfo struct {
	TotalFiles   int `json:"totalFiles"`
	FilesPerPage int `json:"filesPerPage"`
	TotalPages   int `json:"totalPages"`
}

// scanDirectory scans a directory and writes paginated JSON files
func scanDirectory(root string, baseURL string, recursive bool, outputDir string) (map[string]CategoryPageInfo, error) {
	// Use maps to store files per category and track page numbers
	categoryFiles := make(map[string][]FileInfo)
	categoryPageNum := make(map[string]int)
	categoryTotalCount := make(map[string]int)

	// Initialize page numbers to 1
	for _, category := range []string{"image", "video", "audio", "text", "code", "pdf", "archive", "other"} {
		categoryPageNum[category] = 1
	}

	walkFn := func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			// For non-recursive, only process root
			if !recursive && path != root {
				return filepath.SkipDir // Skip subdirectories
			}
			return nil // Continue walking
		}

		// Get the relative path from the root directory
		relPath, err := filepath.Rel(root, path)
		if err != nil {
			return err // Return error to stop walking
		}

		name := info.Name()
		if name == "index.html" || strings.HasSuffix(name, ".json") || name == "meta.json" {
			return nil // Skip generated files
		}

		ext := strings.TrimPrefix(filepath.Ext(name), ".")
		fileType := categorizeFileType(ext)

		webPath := filepath.Join(baseURL, relPath)
		webPath = strings.ReplaceAll(webPath, "\\", "/")

		fileInfo := FileInfo{
			Name:      name,
			Path:      webPath,
			Size:      info.Size(),
			Modified:  info.ModTime(),
			Extension: ext,
			Type:      fileType,
		}

		categoryFiles[fileType] = append(categoryFiles[fileType], fileInfo)
		categoryTotalCount[fileType]++

		// If a category reaches the page size, write it to a JSON file
		if len(categoryFiles[fileType]) >= filesPerPage {
			if err := writePaginatedJSON(categoryFiles[fileType], fileType, categoryPageNum[fileType], outputDir); err != nil {
				log.Printf("Error writing paginated JSON for %s page %d: %v", fileType, categoryPageNum[fileType], err)
				// Don't stop the whole scan for one file error, maybe log and continue?
				// return err // Uncomment to stop on error
			}
			categoryFiles[fileType] = nil // Clear the slice
			categoryPageNum[fileType]++
		}

		return nil
	}

	if recursive {
		if err := filepath.Walk(root, walkFn); err != nil {
			return nil, fmt.Errorf("error walking directory: %w", err)
		}
	} else {
		// Manually walk only the top-level directory for non-recursive
		entries, err := os.ReadDir(root)
		if err != nil {
			return nil, fmt.Errorf("error reading directory: %w", err)
		}
		for _, entry := range entries {
			info, err := entry.Info()
			if err != nil {
				log.Printf("Error getting info for %s: %v", entry.Name(), err)
				continue // Skip this entry
			}
			if err := walkFn(filepath.Join(root, entry.Name()), info, nil); err != nil {
				// Handle potential errors from walkFn if needed
				log.Printf("Error processing entry %s: %v", entry.Name(), err)
			}
		}
	}

	// Write any remaining files
	for fileType, files := range categoryFiles {
		if len(files) > 0 {
			if err := writePaginatedJSON(files, fileType, categoryPageNum[fileType], outputDir); err != nil {
				log.Printf("Error writing final paginated JSON for %s page %d: %v", fileType, categoryPageNum[fileType], err)
			}
		}
	}

	// Prepare metadata
	metaData := make(map[string]CategoryPageInfo)
	for category, totalCount := range categoryTotalCount {
		if totalCount > 0 {
			totalPages := (totalCount + filesPerPage - 1) / filesPerPage // Ceiling division
			metaData[category] = CategoryPageInfo{
				TotalFiles:   totalCount,
				FilesPerPage: filesPerPage,
				TotalPages:   totalPages,
			}
		}
	}

	// Write metadata file
	if err := writeMetaJSON(metaData, outputDir); err != nil {
		return nil, fmt.Errorf("error writing meta.json: %w", err)
	}

	return metaData, nil
}

// writePaginatedJSON writes a single page of files to a JSON file
func writePaginatedJSON(files []FileInfo, category string, pageNum int, outputDir string) error {
	// Sort files within the page before writing (optional, but good for consistency)
	sort.Slice(files, func(i, j int) bool {
		return files[i].Name < files[j].Name
	})

	jsonPath := filepath.Join(outputDir, fmt.Sprintf("%s_%d.json", category, pageNum))
	data, err := json.MarshalIndent(files, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal json for %s page %d: %w", category, pageNum, err)
	}
	err = os.WriteFile(jsonPath, data, 0644)
	if err != nil {
		return fmt.Errorf("failed to write json file %s: %w", jsonPath, err)
	}
	return nil
}

// writeMetaJSON writes the metadata file
func writeMetaJSON(metaData map[string]CategoryPageInfo, outputDir string) error {
	metaPath := filepath.Join(outputDir, "meta.json")
	data, err := json.MarshalIndent(metaData, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal meta json: %w", err)
	}
	if err := os.WriteFile(metaPath, data, 0644); err != nil {
		return fmt.Errorf("failed to write meta json file %s: %w", metaPath, err)
	}
	return nil
}

// generateHTML creates the index.html file in the output directory
func generateHTML(outputDir string, allowDelete bool, thumbnailsEnabled bool, debugLogging bool) error {
	tmplContent, err := templateFS.ReadFile("template/index.html")
	if err != nil {
		return fmt.Errorf("failed to read embedded template: %w", err)
	}

	// Parse the template
	tmpl, err := template.New("index").Parse(string(tmplContent))
	if err != nil {
		return fmt.Errorf("failed to parse template: %w", err)
	}

	// Create the output file
	indexPath := filepath.Join(outputDir, "index.html")
	outFile, err := os.Create(indexPath)
	if err != nil {
		return fmt.Errorf("failed to create index.html: %w", err)
	}
	defer outFile.Close()

	// Execute the template with data
	data := TemplateData{
		AllowDelete:       allowDelete,
		Version:           Version,
		ThumbnailsEnabled: thumbnailsEnabled,
		DebugLogging:      debugLogging,
	}

	if err := tmpl.Execute(outFile, data); err != nil {
		return fmt.Errorf("failed to execute template: %w", err)
	}

	return nil
}

func cleanupOnExit(path string) {
	c := make(chan os.Signal, 1)

	// Handle cross-platform signals
	if runtime.GOOS == "windows" {
		// Windows only reliably supports os.Interrupt (Ctrl+C)
		signal.Notify(c, os.Interrupt)
	} else {
		// Unix-based systems support more signals
		signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	}

	go func() {
		<-c
		fmt.Println("\nCleaning up...")
		os.RemoveAll(path)
		os.Exit(0)
	}()
}

// FileDeleteHandler handles file deletion if enabled
func FileDeleteHandler(inputDir string, allowDelete bool) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !allowDelete {
			http.Error(w, "File deletion is not enabled", http.StatusForbidden)
			return
		}

		if r.Method != "DELETE" {
			http.Error(w, "Only DELETE method is allowed", http.StatusMethodNotAllowed)
			return
		}

		// Extract filename from path, normalize for Windows
		filename := r.URL.Path[len("/delete/"):]
		filename = strings.ReplaceAll(filename, "/", string(os.PathSeparator))

		if filename == "" {
			http.Error(w, "No filename specified", http.StatusBadRequest)
			return
		}

		// Prevent directory traversal
		cleanPath := filepath.Clean(filename)
		if strings.Contains(cleanPath, "..") {
			http.Error(w, "Invalid file path", http.StatusBadRequest)
			return
		}

		fullPath := filepath.Join(inputDir, cleanPath)

		// Check if file exists
		_, err := os.Stat(fullPath)
		if os.IsNotExist(err) {
			http.Error(w, "File not found", http.StatusNotFound)
			return
		}

		// Delete the file
		err = os.Remove(fullPath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete file: %v", err), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "File %s deleted successfully", filename)
	}
}

func copyStaticFiles(outputDir string) error {
	// Walk through embedded static files and copy them to the output directory
	return fs.WalkDir(staticFS, "static", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Skip the root directory
		if path == "static" {
			return nil
		}

		// Create destination path
		dstPath := filepath.Join(outputDir, path)

		// Create directories
		if d.IsDir() {
			return os.MkdirAll(dstPath, fs.ModePerm)
		}

		// Copy files
		data, err := staticFS.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read embedded file %s: %w", path, err)
		}

		if err := os.WriteFile(dstPath, data, 0644); err != nil {
			return fmt.Errorf("failed to write file %s: %w", dstPath, err)
		}

		return nil
	})
}

func main() {
	inputDir := flag.String("indir", "", "Directory to scan for media files")
	outputDir := flag.String("outdir", "", "Directory to write HTML and JSON files (optional)")
	allowDelete := flag.Bool("delete", false, "Enable file deletion API (default: false)")
	showVersion := flag.Bool("v", false, "Print version information and exit")
	hostAddr := flag.String("host", "localhost:8080", "Host address to serve on (default: localhost:8080)")
	recursive := flag.Bool("recursive", true, "Scan directory recursively (default: true)")
	enableThumbnails := flag.Bool("thumbnails", false, "Enable video thumbnail generation (requires FFmpeg)")
	thumbnailCache := flag.String("thumb-cache", "thumbnails", "Directory to store video thumbnails")
	preGenerate := flag.Int("thumb-pregenerate", 50, "Number of video thumbnails to pre-generate at startup")
	debugLog := flag.Bool("log", false, "Enable debug logging (default: false)")
	createConfig := flag.Bool("create-config", false, "Create default config file and exit")
	configPath := flag.String("config", GetDefaultConfigPath(), "Path to config file")

	flag.Usage = func() {
		fmt.Println("Usage: localpics -indir <input_directory> [-outdir <output_directory>] [-delete] [-host <host:port>]")
		flag.PrintDefaults()
	}

	flag.Parse()

	if *showVersion {
		fmt.Printf("LocalPics\nVersion: %s\nCommit: %s\nBuildDate: %s\n", Version, Commit, BuildDate)
		os.Exit(0)
	}

	// Create default config and exit if requested
	if *createConfig {
		defaultConfig := &Config{
			InputDir:       "",
			OutputDir:      "",
			AllowDelete:    false,
			Host:           "localhost:8080",
			Recursive:      true,
			Thumbnails:     false,
			ThumbnailCache: "thumbnails",
			PreGenerate:    50,
			DebugLog:       false,
		}

		if err := SaveConfig(defaultConfig, *configPath); err != nil {
			fmt.Fprintf(os.Stderr, "Error creating config file: %v\n", err)
			os.Exit(1)
		}
		os.Exit(0)
	}

	// Load config (or default if not exists)
	config, err := LoadConfig(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error loading config file: %v\n", err)
	}

	// Override config values with command-line flags if they were explicitly set
	flag.Visit(func(f *flag.Flag) {
		switch f.Name {
		case "indir":
			config.InputDir = *inputDir
		case "outdir":
			config.OutputDir = *outputDir
		case "delete":
			config.AllowDelete = *allowDelete
		case "host":
			config.Host = *hostAddr
		case "recursive":
			config.Recursive = *recursive
		case "thumbnails":
			config.Thumbnails = *enableThumbnails
		case "thumb-cache":
			config.ThumbnailCache = *thumbnailCache
		case "thumb-pregenerate":
			config.PreGenerate = *preGenerate
		case "log":
			config.DebugLog = *debugLog
		}
	})

	debugLogging = config.DebugLog

	// Initialize thumbnails if enabled
	if config.Thumbnails {
		InitThumbnails(true, config.ThumbnailCache, config.PreGenerate, config.DebugLog)
	}

	if config.InputDir == "" {
		fmt.Fprintln(os.Stderr, "Error: input directory (-indir) not specified and not set in config file.")
		flag.Usage()
		os.Exit(1)
	}

	tempOut := false
	if config.OutputDir == "" {
		temp, err := os.MkdirTemp("", "localpics-*")
		if err != nil {
			log.Fatalf("failed to create temporary output directory: %v", err)
		}
		config.OutputDir = temp
		tempOut = true
	}

	if err := os.MkdirAll(config.OutputDir, fs.ModePerm); err != nil {
		log.Fatalf("failed to create output directory: %v", err)
	}

	// Scan directory and generate paginated JSON + meta.json
	_, err = scanDirectory(config.InputDir, "/media", config.Recursive, config.OutputDir)
	if err != nil {
		log.Fatalf("failed to scan directory and write JSON files: %v", err)
	}
	// The metadata is written to meta.json, no need to log it here unless debugging
	// debugLog("Scan complete. Metadata: %+v", metaData) // Correct call if needed

	if err := generateHTML(config.OutputDir, config.AllowDelete, config.Thumbnails, config.DebugLog); err != nil {
		log.Fatalf("failed to write HTML file: %v", err)
	}

	if err := copyStaticFiles(config.OutputDir); err != nil {
		log.Fatalf("failed to copy static files: %v", err)
	}

	if tempOut {
		cleanupOnExit(config.OutputDir)
	}

	if config.AllowDelete {
		fmt.Println("⚠️ WARNING: File deletion API is enabled")
		http.Handle("/delete/", FileDeleteHandler(config.InputDir, true))
	}

	if config.Thumbnails {
		http.Handle("/thumbnail/", ThumbnailHandler(config.InputDir))
		go PreGenerateThumbnails(config.InputDir, config.OutputDir)
	}

	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir(filepath.Join(config.OutputDir, "static")))))
	http.Handle("/media/", http.StripPrefix("/media/", http.FileServer(http.Dir(config.InputDir))))
	http.Handle("/", http.FileServer(http.Dir(config.OutputDir)))

	fmt.Printf("Serving on http://%s\n", config.Host)
	log.Fatal(http.ListenAndServe(config.Host, nil))
}
