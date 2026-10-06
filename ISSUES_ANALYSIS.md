# MicStream Plugin Issues Analysis

## Issue 1: Cannot Find Microphones

### Root Causes

#### 1. Windows PowerShell Command Issues
**Location:** `modules_meshcore/micstream.js` lines 100-126

**Problems:**
- Command `Get-WmiObject Win32_SoundDevice` retrieves ALL sound devices (output and input)
- No filtering for microphone/input devices only
- `Get-WmiObject` is deprecated in newer PowerShell versions
- Output parsing is fragile - relies on line position rather than structured data

**Current Code:**
```javascript
exec('powershell -Command "Get-WmiObject Win32_SoundDevice | Where-Object {$_.ConfigManagerErrorCode -eq 0} | Select-Object Name"', ...)
```

**Issues:**
- Returns speakers, headphones, microphones all together
- Parsing assumes specific line format that may vary
- No distinction between input and output devices

#### 2. Browser/Electron Agent Permission Issues
**Location:** `modules_meshcore/micstream.js` lines 58-93

**Problems:**
- `navigator.mediaDevices.enumerateDevices()` returns empty labels until permissions are granted
- Code doesn't request microphone permissions before enumerating
- Falls back to generic names like "Microphone 1", "Microphone 2" when labels are empty

**Current Code:**
```javascript
navigator.mediaDevices.enumerateDevices()
    .then(function(devices) {
        var mics = [];
        devices.forEach(function(device) {
            if (device.kind === 'audioinput') {
                mics.push({
                    id: device.deviceId,
                    name: device.label || 'Microphone ' + (mics.length + 1)  // Label is empty without permission
                });
            }
        });
    })
```

#### 3. macOS Command Issues
**Location:** `modules_meshcore/micstream.js` lines 127-153

**Problems:**
- `system_profiler SPAudioDataType | grep -A 5 "Microphone"` is fragile
- Parsing logic is simplistic and may miss devices
- Doesn't distinguish between input and output properly

#### 4. Linux Command Issues
**Location:** `modules_meshcore/micstream.js` lines 154-212

**Problems:**
- `pactl list sources short` may not be available on all systems
- Fallback to `arecord -l` may also fail
- Parsing logic for both commands is error-prone

---

## Issue 2: Shows as "My Account" Instead of Another Page on Viewmode

### Root Causes

#### 1. Node ID Mismatch
**Location:** `micstream.js` lines 40-66 and 330-346

**Problem:**
- Server stores mic lists keyed by `myparent.dbNodeKey` (agent's internal node key)
- Web UI requests using `currentNode._id` (different identifier)
- These IDs may not match, causing lookup failures

**Code Flow:**
```javascript
// Server stores with dbNodeKey (line 64)
obj.meshServer.micstream_micLists[myparent.dbNodeKey] = req.mics;

// Web UI requests with currentNode._id (line 340)
meshserver.send({
    action: 'plugin',
    plugin: 'micstream',
    pluginaction: 'getMicList',
    nodeid: currentNode._id  // May not match dbNodeKey
}, ...)

// Server lookup (line 131)
if (obj.meshServer.micstream_micLists && obj.meshServer.micstream_micLists[nodeId]) {
    return { success: true, mics: obj.meshServer.micstream_micLists[nodeId] };
}
```

#### 2. CurrentNode Context Issues
**Location:** `micstream.js` lines 267-270, 333-346

**Problem:**
- `currentNode` global variable may not be set correctly in viewmode
- In viewmode, the context might be the viewing user's account instead of the target device
- No validation that the requested node matches the intended device

#### 3. Session Tracking Issues
**Location:** `micstream.js` lines 405-411

**Problem:**
```javascript
var sessionId = Object.keys(obj.meshServer.webserver.wssessions)[0];  // Gets first session, not necessarily current user
if (sessionId) {
    obj.meshServer.webserver.wssessions[sessionId].micstream_currentNode = currentNode._id;
    obj.meshServer.webserver.wssessions[sessionId].micstream_listening = true;
}
```

- Gets first session key instead of the actual current user's session
- No session ID validation
- May associate audio with wrong user session

#### 4. Viewmode Context Not Handled
**Location:** Throughout `micstream.js`

**Problem:**
- The plugin doesn't detect or handle viewmode differently
- In viewmode, `currentNode` might refer to the viewing account rather than the device being viewed
- No explicit check for viewmode vs normal mode

---

## Recommended Fixes

### Fix 1: Windows Microphone Detection

Replace the PowerShell command with a more specific query:

```javascript
exec('powershell -Command "Get-CimInstance Win32_SoundDevice | Where-Object {$_.ConfigManagerErrorCode -eq 0 -and $_.Name -like \'*mic*\' -or $_.Name -like \'*audio*input*\'} | Select-Object Name"', ...)
```

Or use the Audio API:
```javascript
exec('powershell -Command "[Audio]::Get-AudioDevices() | Where-Object {$_.Type -eq \'Input\'} | Select-Object Name"', ...)
```

### Fix 2: Browser Permission Request

Add explicit permission request before enumeration:

```javascript
// Request permission first
navigator.mediaDevices.getUserMedia({ audio: true })
    .then(function(stream) {
        // Stop the stream immediately, we just needed permission
        stream.getTracks().forEach(track => track.stop());
        
        // Now enumerate with labels
        return navigator.mediaDevices.enumerateDevices();
    })
    .then(function(devices) {
        // ... existing enumeration code
    })
```

### Fix 3: Node ID Consistency

Use consistent node identifiers throughout:

```javascript
// Store with consistent ID
obj.meshServer.micstream_micLists[myparent.nodeid] = req.mics;  // Use nodeid instead of dbNodeKey

// Or use both for compatibility
obj.meshServer.micstream_micLists[myparent.nodeid] = req.mics;
obj.meshServer.micstream_micLists[myparent.dbNodeKey] = req.mics;
```

### Fix 4: Viewmode Detection

Add viewmode detection and context handling:

```javascript
obj.openMicStream = function() {
    if (currentNode == null) {
        alert('No device selected');
        return;
    }

    // Check if in viewmode
    var isViewMode = (typeof viewmode !== 'undefined' && viewmode);
    if (isViewMode) {
        // In viewmode, ensure we're using the viewed device, not the viewer's account
        var targetNodeId = viewedNodeId || currentNode._id;
        // Use targetNodeId for all operations
    } else {
        // Normal mode - use currentNode
    }
    // ...
};
```

### Fix 5: Session Management

Properly identify the current user's session:

```javascript
// Instead of getting first session, get current user's session
var currentSessionId = getCurrentSessionId();  // Need to implement or use MeshCentral's API
if (currentSessionId && obj.meshServer.webserver.wssessions[currentSessionId]) {
    obj.meshServer.webserver.wssessions[currentSessionId].micstream_currentNode = currentNode._id;
}
```

---

## Testing Recommendations

1. Test microphone enumeration on each platform (Windows, macOS, Linux)
2. Test with browser-based agents (Electron) - verify permission flow
3. Test in viewmode vs normal mode
4. Test with multiple devices and multiple users
5. Verify that the correct device's microphones are shown in viewmode
6. Check session handling with multiple concurrent users
