# MicStream Plugin Fixes - Summary of Changes

## Date: October 6, 2026

## Backup Location
All original files have been backed up to the `backup/` directory:
- `backup/micstream.js` - Original server-side plugin
- `backup/micstream_agent.js` - Original agent module
- `backup/config.json` - Original configuration

---

## Changes Made

### 1. Agent Module (`modules_meshcore/micstream.js`)

#### Fix 1: Windows Microphone Detection (Lines 100-154)
**Problem:** PowerShell command retrieved all sound devices (speakers, headphones, microphones) without filtering for input devices only.

**Changes:**
- Replaced deprecated `Get-WmiObject` with `Get-CimInstance`
- Added filters to only match microphone/input devices (`*mic*`, `*input*`, `*recording*`)
- Added fallback method using `Get-PnpDevice` if first method fails
- Improved output parsing to exclude PowerShell headers and empty lines

**Impact:** Should now correctly identify only microphone devices on Windows.

#### Fix 2: Browser/Electron Permission Handling (Lines 57-93)
**Problem:** `navigator.mediaDevices.enumerateDevices()` returns empty device labels until microphone permissions are granted.

**Changes:**
- Added explicit permission request using `getUserMedia({ audio: true })` before enumeration
- Stream is immediately stopped after permission is granted (we only needed permission)
- If permission is denied, falls back to enumeration without permission (generic names)
- Better error handling and logging

**Impact:** Browser-based agents will now show actual microphone names instead of generic "Microphone 1", "Microphone 2".

#### Fix 3: macOS Microphone Detection (Lines 193-255)
**Problem:** `system_profiler` parsing was fragile and didn't properly distinguish input from output devices.

**Changes:**
- Improved parsing logic to identify "Input Devices" section specifically
- Only processes lines within the input section
- Added fallback to grep-based method if structured parsing fails
- Better regex matching for device names

**Impact:** More reliable microphone detection on macOS.

#### Fix 4: Linux Microphone Detection (Lines 256-319)
**Problem:** Commands didn't properly filter for input devices and could include monitor devices.

**Changes:**
- Added filter to exclude `.monitor` devices (these are output monitors, not input)
- Improved `pactl` parsing to handle tab-separated output better
- Fixed regex matching in `arecord` fallback to handle missing matches gracefully
- Better error handling in fallback chain

**Impact:** More accurate microphone detection on Linux systems.

---

### 2. Server-Side Plugin (`micstream.js`)

#### Fix 5: Node ID Consistency (Lines 59-66)
**Problem:** Mic lists stored with `dbNodeKey` but requested with `nodeid`, causing lookup failures.

**Changes:**
- Store microphone lists with both `nodeid` and `dbNodeKey` for compatibility
- Added debug logging to show both IDs
- Ensures lookups work regardless of which ID is used

**Impact:** Microphone lists will now be retrievable regardless of ID type used.

#### Fix 6: Viewmode Detection and Context (Lines 268-345)
**Problem:** In viewmode, `currentNode` refers to the viewing user's account instead of the target device.

**Changes:**
- Added viewmode detection: `var isViewMode = (typeof viewmode !== 'undefined' && viewmode)`
- Store target node ID: `obj.micstream_targetNodeId` for use across functions
- Check for `viewedNodeId` in viewmode context and use it if available
- Added console logging for debugging viewmode issues

**Impact:** In viewmode, the plugin will now correctly target the viewed device instead of the viewer's account.

#### Fix 7: Update Mic List with Target Node (Lines 353-376)
**Problem:** `updateMicList()` always used `currentNode._id`, which is wrong in viewmode.

**Changes:**
- Use stored `obj.micstream_targetNodeId` instead of `currentNode._id`
- Fallback to `currentNode._id` if target not set
- Added console logging for debugging

**Impact:** Mic list requests will now use the correct node ID in viewmode.

#### Fix 8: Enhanced Agent Lookup in handleCommand (Lines 129-227)
**Problem:** Direct lookup by `nodeid` often failed because agents were stored under different keys.

**Changes:**
- Added multiple lookup strategies for finding agents
- First try direct lookup by `nodeid`
- If not found, iterate through all agents and match by `dbNodeKey` or `nodeid`
- Same logic applied to mic list lookup
- More robust error handling

**Impact:** Agent commands will now be sent to the correct agent even with ID mismatches.

#### Fix 9: Improved Session Management in startStreaming (Lines 417-482)
**Problem:** Always used first session key instead of current user's session.

**Changes:**
- Try to find session matching current user's `userid`
- Look through all sessions to find matching `userid`
- Fallback to first session if current user's session not found
- Better logging for session management

**Impact:** Audio will now be routed to the correct user's session instead of arbitrarily to the first session.

#### Fix 10: Stop Streaming with Target Node (Lines 484-519)
**Problem:** Used `currentNode._id` which is wrong in viewmode.

**Changes:**
- Use stored `obj.micstream_targetNodeId` instead
- Added console logging for debugging

**Impact:** Stop commands will now target the correct device in viewmode.

---

## Testing Recommendations

1. **Test Microphone Detection:**
   - Windows: Verify only input devices are listed
   - macOS: Verify input devices are correctly identified
   - Linux: Verify pactl/arecord properly detect microphones
   - Browser/Electron: Verify permission flow and device labels

2. **Test Viewmode:**
   - Enter viewmode on a device
   - Open MicStream plugin
   - Verify it shows the viewed device's microphones, not your account
   - Start streaming and verify audio comes from viewed device

3. **Test Session Management:**
   - Have multiple users connected
   - Start streaming from different accounts
   - Verify audio goes to the correct user

4. **Test Node ID Handling:**
   - Verify mic list retrieval works with various ID formats
   - Verify agent commands reach the correct agent

---

## Additional Notes

- All changes maintain backward compatibility
- Fallback mechanisms added for robustness
- Extensive console logging added for debugging
- No breaking changes to the plugin API
- Original files preserved in `backup/` directory

---

## Rollback Instructions

If you need to revert these changes:

```bash
cp backup/micstream.js micstream.js
cp backup/micstream_agent.js modules_meshcore/micstream.js
cp backup/config.json config.json
```

Then restart your MeshCentral server.
