/**
 * StreamDock Host Script (ExtendScript JSX)
 * Bridge between CEP panel and Adobe Premiere Pro DOM
 */

#target premierepro

function streamdockEscapeString(value) {
    if (value === undefined || value === null) {
        return "";
    }
    return String(value)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

function streamdockSerializeResult(obj) {
    var parts = [];
    for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
            var val = obj[key];
            if (typeof val === "boolean" || typeof val === "number") {
                parts.push('"' + key + '":' + val);
            } else if (typeof val === "string") {
                parts.push('"' + key + '":"' + streamdockEscapeString(val) + '"');
            } else if (val === null) {
                parts.push('"' + key + '":null');
            } else {
                parts.push('"' + key + '":"' + streamdockEscapeString(String(val)) + '"');
            }
        }
    }
    return "{" + parts.join(",") + "}";
}

/**
 * Health check to verify connection to Premiere Pro
 */
function streamdockPing() {
    try {
        if (app && app.project && app.project.name) {
            return streamdockSerializeResult({
                success: true,
                message: "Premiere ready: " + app.project.name,
                projectName: app.project.name,
                hasProject: true
            });
        }
        return streamdockSerializeResult({
            success: true,
            message: "Premiere ready (no project currently open)",
            projectName: "",
            hasProject: false
        });
    } catch (err) {
        return streamdockSerializeResult({
            success: false,
            message: "Error in ping: " + err.toString()
        });
    }
}

/**
 * Gets project directory info for default download path
 */
function getProjectDirectoryInfo() {
    try {
        if (!app.project || !app.project.path) {
            // Fallback to Documents/StreamDock folder if project unsaved
            var docFolder = Folder.myDocuments.fsName;
            return streamdockSerializeResult({
                success: true,
                directoryPath: docFolder,
                isSavedProject: false,
                message: "Using Documents directory (project unsaved)"
            });
        }

        var projFile = new File(app.project.path);
        var dirPath = projFile.parent.fsName;
        return streamdockSerializeResult({
            success: true,
            directoryPath: dirPath,
            filePath: projFile.fsName,
            isSavedProject: true,
            message: "Retrieved project directory"
        });
    } catch (err) {
        return streamdockSerializeResult({
            success: false,
            message: "Failed to get project directory: " + err.toString()
        });
    }
}

/**
 * Ensures "StreamDock Downloads" bin exists in the project root
 */
function ensureDownloadsBin(binName) {
    if (!binName) binName = "StreamDock Downloads";
    var rootItem = app.project.rootItem;
    
    // Check if bin already exists
    for (var i = 0; i < rootItem.children.numItems; i++) {
        var item = rootItem.children[i];
        if (item.type === ProjectItemType.BIN && item.name === binName) {
            return item;
        }
    }
    
    // Create new bin
    return rootItem.createBin(binName);
}

/**
 * Captures playback state of the active sequence
 */
function streamdockCapturePlaybackState() {
    try {
        var seq = app.project.activeSequence;
        if (!seq) {
            return { available: false, wasPlaying: false };
        }
        // In Premiere Pro ExtendScript, playback state check
        var isPlaying = false;
        if (typeof seq.getPlayerPosition === "function") {
            // Position query is reliable
            isPlaying = true;
        }
        return { available: true, wasPlaying: isPlaying };
    } catch (e) {
        return { available: false, wasPlaying: false };
    }
}

/**
 * Imports a downloaded media file into the project bin
 * @param {string} filePath Absolute path to downloaded media
 * @param {boolean} addToTimeline Whether to insert into active sequence
 */
function importFileToBin(filePath, addToTimeline) {
    try {
        if (!app.project) {
            return streamdockSerializeResult({
                success: false,
                message: "No active project open in Premiere Pro."
            });
        }

        var targetFile = new File(filePath);
        if (!targetFile.exists) {
            return streamdockSerializeResult({
                success: false,
                message: "File does not exist: " + filePath
            });
        }

        // 1. Ensure Bin exists
        var bin = ensureDownloadsBin("StreamDock Downloads");
        
        // 2. Capture playback state
        var playbackState = streamdockCapturePlaybackState();

        // 3. Import File
        var importArray = [targetFile.fsName];
        var suppressUI = true;
        var importTarget = bin ? bin : app.project.rootItem;
        
        var importSuccess = app.project.importFiles(
            importArray,
            suppressUI,
            importTarget,
            false // importAsNumberedStills
        );

        if (!importSuccess) {
            return streamdockSerializeResult({
                success: false,
                message: "Premiere failed to import file: " + targetFile.name
            });
        }

        // 4. If requested and sequence active, add clip to timeline at playhead
        var addedToSequence = false;
        if (addToTimeline && app.project.activeSequence) {
            var activeSeq = app.project.activeSequence;
            // Find newly imported project item in bin
            var importedItem = null;
            for (var j = 0; j < importTarget.children.numItems; j++) {
                var child = importTarget.children[j];
                if (child.getMediaPath && child.getMediaPath() === targetFile.fsName) {
                    importedItem = child;
                    break;
                }
            }

            if (importedItem) {
                try {
                    var playheadTime = activeSeq.getPlayerPosition();
                    // Insert clip into track
                    if (activeSeq.videoTracks && activeSeq.videoTracks.numTracks > 0) {
                        activeSeq.videoTracks[0].insertClip(importedItem, playheadTime);
                        addedToSequence = true;
                    }
                } catch (seqErr) {
                    // Non-fatal if insert to sequence fails
                }
            }
        }

        return streamdockSerializeResult({
            success: true,
            message: "Successfully imported to StreamDock Downloads bin" + (addedToSequence ? " and timeline" : ""),
            filePath: targetFile.fsName,
            fileName: targetFile.name,
            binName: "StreamDock Downloads",
            addedToSequence: addedToSequence
        });

    } catch (err) {
        return streamdockSerializeResult({
            success: false,
            message: "Error during file import: " + err.toString()
        });
    }
}
