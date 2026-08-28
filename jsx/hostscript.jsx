/**
 * StreamDock Host Script (ExtendScript JSX)
 * Bridge between CEP panel and Adobe Premiere Pro & Adobe After Effects DOM
 */

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
 * Detects whether running inside Adobe Premiere Pro, After Effects, or other host
 */
function getHostApplication() {
    try {
        // 1. Check unique global ExtendScript constructors / types
        if (typeof ImportOptions !== "undefined" || typeof CompItem !== "undefined" || typeof FolderItem !== "undefined") {
            return "aftereffects";
        }
        if (typeof ProjectItemType !== "undefined") {
            return "premierepro";
        }

        // 2. Check BridgeTalk
        if (typeof BridgeTalk !== "undefined" && BridgeTalk.appName) {
            var name = String(BridgeTalk.appName).toLowerCase();
            if (name.indexOf("aftereffects") !== -1 || name.indexOf("aeft") !== -1) return "aftereffects";
            if (name.indexOf("premiere") !== -1 || name.indexOf("ppro") !== -1) return "premierepro";
        }

        // 3. Check app properties
        if (typeof app !== "undefined") {
            if (app.appName) {
                var appN = String(app.appName).toLowerCase();
                if (appN.indexOf("after effects") !== -1) return "aftereffects";
                if (appN.indexOf("premiere") !== -1) return "premierepro";
            }
            if (app.project) {
                if (typeof app.project.importFiles !== "undefined") return "premierepro";
                if (typeof app.project.importFile !== "undefined") return "aftereffects";
            }
        }
    } catch (e) {}
    return "unknown";
}

/**
 * Health check to verify connection to Premiere Pro or After Effects
 */
function streamdockPing() {
    try {
        var host = getHostApplication();
        var projName = "";
        var hasProj = false;

        if (host === "aftereffects") {
            if (app.project) {
                projName = (app.project.file && app.project.file.name) ? app.project.file.name : (app.project.numItems > 0 ? "Untitled Project" : "");
                hasProj = !!(app.project.file || app.project.numItems > 0);
            }
            return streamdockSerializeResult({
                success: true,
                host: "aftereffects",
                hostDisplay: "Adobe After Effects",
                message: hasProj ? "After Effects ready: " + projName : "After Effects ready (no project open)",
                projectName: projName,
                hasProject: hasProj
            });
        }

        // Premiere Pro
        if (app && app.project && app.project.name) {
            return streamdockSerializeResult({
                success: true,
                host: "premierepro",
                hostDisplay: "Adobe Premiere Pro",
                message: "Premiere ready: " + app.project.name,
                projectName: app.project.name,
                hasProject: true
            });
        }

        return streamdockSerializeResult({
            success: true,
            host: "premierepro",
            hostDisplay: "Adobe Premiere Pro",
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
 * Gets project directory info for default download path across Premiere and AE
 */
function getProjectDirectoryInfo() {
    try {
        var host = getHostApplication();
        var docFolder = Folder.myDocuments ? Folder.myDocuments.fsName : "";

        if (host === "aftereffects") {
            if (app.project && app.project.file && app.project.file.exists) {
                return streamdockSerializeResult({
                    success: true,
                    directoryPath: app.project.file.parent.fsName,
                    filePath: app.project.file.fsName,
                    isSavedProject: true,
                    message: "Retrieved After Effects project directory"
                });
            }
            return streamdockSerializeResult({
                success: true,
                directoryPath: docFolder,
                isSavedProject: false,
                message: "Using Documents directory (After Effects project unsaved)"
            });
        }

        // Premiere Pro
        if (!app.project || !app.project.path) {
            return streamdockSerializeResult({
                success: true,
                directoryPath: docFolder,
                isSavedProject: false,
                message: "Using Documents directory (Premiere project unsaved)"
            });
        }

        var projFile = new File(app.project.path);
        return streamdockSerializeResult({
            success: true,
            directoryPath: projFile.parent.fsName,
            filePath: projFile.fsName,
            isSavedProject: true,
            message: "Retrieved Premiere project directory"
        });
    } catch (err) {
        return streamdockSerializeResult({
            success: false,
            message: "Failed to get project directory: " + err.toString()
        });
    }
}

// ─── Premiere Pro Helpers ───────────────────────────────────────────────────

function ensurePremiereDownloadsBin(binName) {
    if (!binName) binName = "StreamDock Downloads";
    var rootItem = app.project.rootItem;
    for (var i = 0; i < rootItem.children.numItems; i++) {
        var item = rootItem.children[i];
        var isBin = (typeof ProjectItemType !== "undefined" && typeof ProjectItemType.BIN !== "undefined") ? (item.type === ProjectItemType.BIN) : (item.type === 2);
        if (isBin && item.name === binName) {
            return item;
        }
    }
    return rootItem.createBin(binName);
}

function importFileToPremiere(targetFile, addToTimeline) {
    if (!app.project) {
        return streamdockSerializeResult({
            success: false,
            message: "No active project open in Premiere Pro."
        });
    }

    var bin = ensurePremiereDownloadsBin("StreamDock Downloads");
    var importArray = [targetFile.fsName];
    var importTarget = bin ? bin : app.project.rootItem;

    var importSuccess = app.project.importFiles(
        importArray,
        true, // suppressUI
        importTarget,
        false // importAsNumberedStills
    );

    if (!importSuccess) {
        return streamdockSerializeResult({
            success: false,
            message: "Premiere failed to import file: " + targetFile.name
        });
    }

    var addedToSequence = false;
    if (addToTimeline && app.project.activeSequence) {
        var activeSeq = app.project.activeSequence;
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
                if (activeSeq.videoTracks && activeSeq.videoTracks.numTracks > 0) {
                    activeSeq.videoTracks[0].insertClip(importedItem, playheadTime);
                    addedToSequence = true;
                }
            } catch (seqErr) {}
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
}

// ─── After Effects Helpers ──────────────────────────────────────────────────

function ensureAEFolder(folderName) {
    if (!folderName) folderName = "StreamDock Downloads";
    if (!app.project) return null;
    for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item && (item instanceof FolderItem || item.typeName === "Folder") && item.name === folderName) {
            return item;
        }
    }
    return app.project.items.addFolder(folderName);
}

function importFileToAfterEffects(targetFile, addToComp) {
    if (!app.project) {
        try {
            app.newProject();
        } catch (e) {
            return streamdockSerializeResult({
                success: false,
                message: "No active project open in After Effects."
            });
        }
    }

    var importOptions = new ImportOptions(targetFile);
    if (!importOptions.canImportAs(ImportAsType.FOOTAGE)) {
        return streamdockSerializeResult({
            success: false,
            message: "Cannot import file as footage in After Effects: " + targetFile.name
        });
    }

    importOptions.importAs = ImportAsType.FOOTAGE;
    var footageItem = app.project.importFile(importOptions);

    if (!footageItem) {
        return streamdockSerializeResult({
            success: false,
            message: "After Effects failed to import file: " + targetFile.name
        });
    }

    // Move to "StreamDock Downloads" folder in project panel
    try {
        var folder = ensureAEFolder("StreamDock Downloads");
        if (folder) {
            footageItem.parentFolder = folder;
        }
    } catch (fErr) {}

    // If requested, add clip layer to active composition or first open composition
    var addedToComp = false;
    if (addToComp) {
        try {
            var comp = null;
            if (app.project.activeItem && (app.project.activeItem instanceof CompItem || app.project.activeItem.typeName === "Composition")) {
                comp = app.project.activeItem;
            } else {
                for (var k = 1; k <= app.project.numItems; k++) {
                    var it = app.project.item(k);
                    if (it && (it instanceof CompItem || it.typeName === "Composition")) {
                        comp = it;
                        break;
                    }
                }
            }

            if (comp) {
                var layer = comp.layers.add(footageItem);
                if (layer) {
                    layer.startTime = comp.time;
                    addedToComp = true;
                }
            }
        } catch (compErr) {}
    }

    return streamdockSerializeResult({
        success: true,
        message: "Successfully imported to StreamDock Downloads folder" + (addedToComp ? " and active composition" : ""),
        filePath: targetFile.fsName,
        fileName: targetFile.name,
        binName: "StreamDock Downloads",
        addedToSequence: addedToComp
    });
}

// ─── Universal Entry Point ──────────────────────────────────────────────────

/**
 * Imports a downloaded media file into the project bin / folder
 * @param {string} filePath Absolute path to downloaded media
 * @param {boolean} addToTimeline Whether to insert into active sequence/composition
 */
function importFileToBin(filePath, addToTimeline) {
    try {
        var targetFile = new File(filePath);
        if (!targetFile.exists) {
            return streamdockSerializeResult({
                success: false,
                message: "File does not exist: " + filePath
            });
        }

        var host = getHostApplication();
        if (host === "aftereffects") {
            return importFileToAfterEffects(targetFile, addToTimeline);
        } else {
            return importFileToPremiere(targetFile, addToTimeline);
        }
    } catch (err) {
        return streamdockSerializeResult({
            success: false,
            message: "Error during file import: " + err.toString()
        });
    }
}
