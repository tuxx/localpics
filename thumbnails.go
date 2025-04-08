// File: thumbnails.go
package main

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	ffmpeg_go "github.com/u2takey/ffmpeg-go"
)

// ThumbConfig holds thumbnail generation settings
type ThumbConfig struct {
	Enabled       bool   // Whether thumbnails are enabled (default: false)
	CacheDir      string // Directory to store cached thumbnails
	PreGenerate   int    // Number of thumbnails to pre-generate at startup
	Width         int    // Thumbnail width
	Height        int    // Thumbnail height
	MaxConcurrent int    // Maximum concurrent thumbnail generations
}

// VideoSignature holds identifying information for videos
type VideoSignature struct {
	Size       int64  // File size
	ModTime    int64  // Modification timestamp
	HeaderHash string // Hash of first 1MB
}

// Global variables
var (
	ThumbnailCache      = make(map[string]string)
	ThumbnailCacheMutex sync.RWMutex
	ThumbnailSemaphore  chan struct{}
	ThumbnailConfig     ThumbConfig
	ThumbnailEnabled    bool // Simple flag to check from main.go
	thumbnailChanged    bool // Still private, only used internally
	debugLogging        bool
	originalLogOutput   io.Writer
)

func withSuppressedLogging(f func() error) error {
	if !debugLogging {
		// Save the current log output
		originalLogOutput = log.Writer()
		// Disable logging
		log.SetOutput(io.Discard)
		// Restore logging when done
		defer log.SetOutput(originalLogOutput)
	}

	// Execute the function with logging suppressed
	return f()
}

// GetVideoSignature generates a signature for duplicate detection
func GetVideoSignature(videoPath string) (VideoSignature, error) {
	// Get basic file info
	fileInfo, err := os.Stat(videoPath)
	if err != nil {
		return VideoSignature{}, err
	}

	signature := VideoSignature{
		Size:    fileInfo.Size(),
		ModTime: fileInfo.ModTime().Unix(),
	}

	// Hash first 1MB of file for more accurate detection
	if signature.Size > 0 {
		file, err := os.Open(videoPath)
		if err == nil {
			defer file.Close()

			// Read first 1MB
			headerSize := int64(1024 * 1024) // 1MB
			if signature.Size < headerSize {
				headerSize = signature.Size
			}

			buffer := make([]byte, headerSize)
			if _, err := io.ReadFull(file, buffer); err == nil {
				h := md5.Sum(buffer)
				signature.HeaderHash = fmt.Sprintf("%x", h)
			}
		}
	}

	return signature, nil
}

// GetSignatureHash returns a string hash of the video signature
func GetSignatureHash(sig VideoSignature) string {
	// Combine file size and header hash
	data := fmt.Sprintf("%d-%s", sig.Size, sig.HeaderHash)
	hash := md5.Sum([]byte(data))
	return fmt.Sprintf("%x", hash)
}

// Cache management functions
func loadThumbnailCache() {
	cacheFile := filepath.Join(ThumbnailConfig.CacheDir, "cache.json")
	data, err := os.ReadFile(cacheFile)
	if err != nil {
		log.Printf("No existing thumbnail cache found or error reading it: %v", err)
		return
	}

	ThumbnailCacheMutex.Lock()
	defer ThumbnailCacheMutex.Unlock()

	if err := json.Unmarshal(data, &ThumbnailCache); err != nil {
		log.Printf("Error parsing thumbnail cache: %v", err)
		// Start with empty cache
		ThumbnailCache = make(map[string]string)
	}

	debugLog("Loaded %d entries from thumbnail cache", len(ThumbnailCache))
}

// saveThumbnailCache persists the cache to disk
func saveThumbnailCache() {
	if !thumbnailChanged {
		return // Don't save if no changes
	}

	ThumbnailCacheMutex.RLock()
	data, err := json.Marshal(ThumbnailCache)
	ThumbnailCacheMutex.RUnlock()

	if err != nil {
		log.Printf("Error serializing thumbnail cache: %v", err)
		return
	}

	cacheFile := filepath.Join(ThumbnailConfig.CacheDir, "cache.json")
	if err := os.WriteFile(cacheFile, data, 0644); err != nil {
		log.Printf("Error writing thumbnail cache: %v", err)
		return
	}

	thumbnailChanged = false
	debugLog("Saved %d entries to thumbnail cache", len(ThumbnailCache))
}

// startCacheSaver starts a goroutine to periodically save the cache
func startCacheSaver() {
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			ThumbnailCacheMutex.RLock() // Ensure we only save if needed
			changed := thumbnailChanged
			ThumbnailCacheMutex.RUnlock()
			if changed {
				saveThumbnailCache()
			}
		}
	}()
}

func getOutputWriter() io.Writer {
	if debugLogging {
		return os.Stderr // Use standard error when debug logging is enabled
	}
	return io.Discard // Discard output when debug logging is disabled
}

// GenerateVideoThumbnail creates an optimized thumbnail for a video
func GenerateVideoThumbnail(videoPath, outputPath string) error {
	// Acquire a semaphore slot to limit concurrent processing
	ThumbnailSemaphore <- struct{}{}
	defer func() { <-ThumbnailSemaphore }()

	// Calculate seek time (10% into the video or 3 seconds, whichever is greater)
	seekTime := 3.0 // Default to 3 seconds

	// Run the probe with suppressed logging if needed
	return withSuppressedLogging(func() error {
		// Try a quick duration check if possible
		data, probeErr := ffmpeg_go.ProbeWithTimeout(videoPath, time.Second*2, ffmpeg_go.KwArgs{
			"show_entries":   "format=duration",
			"select_streams": "v:0",
			"of":             "json",
		})

		// Process the result
		if probeErr == nil {
			// Try to parse duration
			var probeData struct {
				Format struct {
					Duration string `json:"duration"`
				} `json:"format"`
			}

			if json.Unmarshal([]byte(data), &probeData) == nil {
				if duration, err := strconv.ParseFloat(probeData.Format.Duration, 64); err == nil && duration > 0 {
					seekTime = duration * 0.1 // 10% into the video
					if seekTime < 3.0 {
						seekTime = 3.0 // Minimum 3 seconds in
					}
				}
			}
		}

		// Build optimized ffmpeg command
		ffmpegCmd := ffmpeg_go.Input(videoPath, ffmpeg_go.KwArgs{
			"ss":              seekTime,
			"noaccurate_seek": "",
		}).
			Output(outputPath, ffmpeg_go.KwArgs{
				"map":      "0:v:0",  // Only first video stream
				"vframes":  1,        // Single frame
				"format":   "image2", // Output as image
				"vcodec":   "mjpeg",  // Use MJPEG codec
				"s":        fmt.Sprintf("%dx%d", ThumbnailConfig.Width, ThumbnailConfig.Height),
				"qscale:v": 5, // Quality setting (1-31, lower is better)
			}).
			GlobalArgs("-loglevel", "quiet").
			OverWriteOutput()

		// Run the command
		err := ffmpegCmd.Run()

		if err != nil {
			return fmt.Errorf("ffmpeg thumbnail generation failed: %w", err)
		}

		return nil
	})
}

// GetOrCreateThumbnail checks for duplicates before generating thumbnails
func GetOrCreateThumbnail(videoPath string) (string, error) {
	if !ThumbnailEnabled {
		return "", fmt.Errorf("thumbnail generation is disabled")
	}

	// Generate video signature for duplicate detection
	signature, err := GetVideoSignature(videoPath)
	if err != nil {
		return "", fmt.Errorf("failed to get video signature: %w", err)
	}

	// Generate hash for the signature
	sigHash := GetSignatureHash(signature)

	// Check cache first (read lock)
	ThumbnailCacheMutex.RLock()
	cachedPath, exists := ThumbnailCache[sigHash]
	ThumbnailCacheMutex.RUnlock()

	if exists {
		// Verify the cached thumbnail exists
		if _, err := os.Stat(cachedPath); err == nil {
			return cachedPath, nil
		}
		// If file doesn't exist, continue to regenerate
	}

	// Generate thumbnail path
	thumbnailPath := filepath.Join(ThumbnailConfig.CacheDir, sigHash+".jpg")

	// Check if thumbnail already exists on disk but not in cache
	if _, err := os.Stat(thumbnailPath); err == nil {
		// Store in cache and return
		ThumbnailCacheMutex.Lock()
		ThumbnailCache[sigHash] = thumbnailPath
		thumbnailChanged = true
		ThumbnailCacheMutex.Unlock()
		return thumbnailPath, nil
	}

	// Ensure the thumbnail directory exists
	if err := os.MkdirAll(filepath.Dir(thumbnailPath), 0755); err != nil {
		return "", fmt.Errorf("failed to create thumbnail directory: %w", err)
	}

	// Generate thumbnail
	if err := GenerateVideoThumbnail(videoPath, thumbnailPath); err != nil {
		return "", err
	}

	// Store in cache
	ThumbnailCacheMutex.Lock()
	ThumbnailCache[sigHash] = thumbnailPath
	thumbnailChanged = true
	ThumbnailCacheMutex.Unlock()

	return thumbnailPath, nil
}

// ThumbnailHandler serves video thumbnails via HTTP
func ThumbnailHandler(inputDir string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !ThumbnailEnabled {
			http.Error(w, "Thumbnail generation is disabled", http.StatusNotFound)
			return
		}

		// Extract video path from URL (remove "/thumbnail/" prefix)
		videoPathBase := r.URL.Path[len("/thumbnail/"):]
		decodedPath, err := url.PathUnescape(videoPathBase)
		if err != nil {
			http.Error(w, "Invalid path encoding", http.StatusBadRequest)
			return
		}

		videoPath := filepath.Join(inputDir, decodedPath)

		// Security check: ensure the path is within the input directory
		absInputDir, _ := filepath.Abs(inputDir)
		absVideoPath, _ := filepath.Abs(videoPath)
		if !strings.HasPrefix(absVideoPath, absInputDir) {
			http.Error(w, "Invalid path", http.StatusBadRequest)
			return
		}

		// Check if the video exists
		if _, err := os.Stat(videoPath); os.IsNotExist(err) {
			http.Error(w, "Video not found", http.StatusNotFound)
			return
		}

		// Generate or retrieve thumbnail
		thumbnailPath, err := GetOrCreateThumbnail(videoPath)
		if err != nil {
			http.Error(w, "Failed to generate thumbnail: "+err.Error(), http.StatusInternalServerError)
			return
		}

		// Serve the thumbnail
		http.ServeFile(w, r, thumbnailPath)
	}
}

// PreGenerateThumbnails generates thumbnails for videos on the first page (video_1.json)
func PreGenerateThumbnails(inputDir string, outputDir string) {
	if !ThumbnailEnabled || ThumbnailConfig.PreGenerate <= 0 {
		return
	}

	debugLog("Attempting to pre-generate up to %d thumbnails...", ThumbnailConfig.PreGenerate)

	// Construct path to the first page of video data
	firstPagePath := filepath.Join(outputDir, "video_1.json")

	// Read the first page JSON
	jsonData, err := os.ReadFile(firstPagePath)
	if err != nil {
		if os.IsNotExist(err) {
			debugLog("video_1.json not found, no video thumbnails to pre-generate.")
			return
		}
		log.Printf("Error reading video_1.json for pre-generation: %v", err)
		return
	}

	var firstPageVideos []FileInfo
	if err := json.Unmarshal(jsonData, &firstPageVideos); err != nil {
		log.Printf("Error unmarshalling video_1.json for pre-generation: %v", err)
		return
	}

	if len(firstPageVideos) == 0 {
		debugLog("No videos found on the first page (video_1.json). Skipping pre-generation.")
		return
	}

	numToProcess := ThumbnailConfig.PreGenerate
	if len(firstPageVideos) < numToProcess {
		numToProcess = len(firstPageVideos)
	}

	debugLog("Found %d videos on first page. Pre-generating thumbnails for the first %d...",
		len(firstPageVideos), numToProcess)

	processed := 0        // Count attempts
	var wg sync.WaitGroup // Use WaitGroup to wait for all goroutines

	for _, file := range firstPageVideos {
		if file.Type != "video" { // Should always be video, but double-check
			continue
		}

		if processed >= numToProcess { // Use numToProcess limit
			break
		}
		processed++

		// Get full path to the video
		// file.Path is like "/media/subdir/video.mp4"
		videoPath := filepath.Join(inputDir, file.Path[len("/media/"):])

		wg.Add(1)
		go func(vPath string) {
			defer wg.Done()
			_, err := GetOrCreateThumbnail(vPath)
			if err != nil {
				// Only log errors during pre-gen if debug logging is enabled to reduce noise
				if debugLogging {
					log.Printf("[DEBUG] Failed pre-generating thumbnail for %s: %v", filepath.Base(vPath), err)
				}
			} else {
				// Successfully generated or retrieved from cache
				// Use atomic increment if this becomes a high-contention point, but likely fine.
				// We don't need a separate counter, WaitGroup handles completion.
			}
		}(videoPath)
	}

	// Wait for all initiated thumbnail generations to complete
	wg.Wait()

	// Save cache one final time after pre-generation attempt completes
	debugLog("Thumbnail pre-generation attempt finished for first page videos.")
	ThumbnailCacheMutex.RLock() // Check if any changes occurred during pre-gen
	changed := thumbnailChanged
	ThumbnailCacheMutex.RUnlock()
	if changed {
		saveThumbnailCache()
	}
}

// InitThumbnails initializes the thumbnail system
func InitThumbnails(enableThumbnails bool, cacheDir string, preGenerate int, debug bool) {
	debugLogging = debug
	ThumbnailEnabled = enableThumbnails

	if !ThumbnailEnabled {
		return
	}

	ThumbnailConfig = ThumbConfig{
		Enabled:       true,
		CacheDir:      cacheDir,
		PreGenerate:   preGenerate,
		Width:         320,
		Height:        180,
		MaxConcurrent: 2, // Limit concurrent generations
	}

	// Initialize semaphore for concurrency control
	ThumbnailSemaphore = make(chan struct{}, ThumbnailConfig.MaxConcurrent)

	// Create cache directory if it doesn't exist
	if err := os.MkdirAll(ThumbnailConfig.CacheDir, 0755); err != nil {
		log.Printf("Warning: Failed to create thumbnail cache directory: %v", err)
		ThumbnailEnabled = false // Disable if cache dir fails
		return
	}

	// Try to load existing cache
	loadThumbnailCache()

	// Start the periodic cache saver
	startCacheSaver()

	logMsg := fmt.Sprintf("Video thumbnail generation enabled (cache: %s", ThumbnailConfig.CacheDir)
	if ThumbnailConfig.PreGenerate > 0 {
		logMsg += fmt.Sprintf(", pre-generate: %d", ThumbnailConfig.PreGenerate)
	}
	logMsg += ")"
	log.Println(logMsg)

	// Set log output based on debug flag AFTER initial setup logs
	if !debugLogging {
		log.SetOutput(io.Discard) // Suppress ffmpeg-go info logs if not debugging
	}
}
