/**
* @description MeshCentral Microphone Stream Plugin
* @author MeshCentral Plugin Developer
* @copyright 
* @license Apache-2.0
* @version v0.1.0
*/

"use strict";

module.exports.micstream = function (parent) {
    var obj = {};
    obj.parent = parent;
    obj.meshServer = parent.parent;
    obj.debug = obj.meshServer.debug;
    obj.activeStreams = {}; // Track active audio streams by node ID
    obj.audioBuffers = {}; // Buffer for chunked audio data by node ID
    
    obj.exports = [
        'onWebUIStartupEnd',
        'onDeviceRefreshEnd',
        'openMicStream',
        'startStreaming',
        'stopStreaming',
        'updateMicList',
        'handleAudioData',
        'handleMicListResponse',
        'handleServerResponse',
        'handleCommand',
        'addQuickToggleButton'
    ];
    
    // Server startup hook
    obj.server_startup = function() {
        obj.debug('PLUGIN', 'MicStream', 'Plugin initialized');
    };
    
    // Hook called when agent checks in
    obj.hook_agentCoreIsStable = function(myparent, gp) {
        obj.debug('PLUGIN', 'MicStream', 'Agent stable: ' + myparent.dbNodeKey);
        // Request microphone list from the agent
        try {
            myparent.agent.sendCommand({
                action: 'plugin',
                plugin: 'micstream',
                pluginaction: 'getMicList'
            });
        } catch (e) {
            obj.debug('PLUGIN', 'MicStream', 'Error requesting mic list: ' + e);
        }
    };
    
    // Hook for processing agent data
    obj.hook_processAgentData = function(myparent, req, res, func) {
        if (req.action === 'plugin' && req.plugin === 'micstream') {
            obj.debug('PLUGIN', 'MicStream', 'Received plugin action: ' + req.pluginaction);
            
            switch (req.pluginaction) {
                case 'micList':
                    // Store microphone list for this node
                    if (!obj.meshServer.micstream_micLists) {
                        obj.meshServer.micstream_micLists = {};
                    }
                    obj.meshServer.micstream_micLists[myparent.dbNodeKey] = req.mics;
                    obj.debug('PLUGIN', 'MicStream', 'Received mic list for node: ' + myparent.dbNodeKey);
                    break;
                    
                case 'audioData':
                    // Handle chunked audio data
                    if (req.chunk) {
                        if (!obj.audioBuffers[myparent.dbNodeKey]) {
                            obj.audioBuffers[myparent.dbNodeKey] = '';
                        }
                        obj.audioBuffers[myparent.dbNodeKey] += req.data;
                        
                        // Send complete buffer when final chunk received
                        if (req.finalChunk) {
                            obj.forwardAudioData(myparent.dbNodeKey, obj.audioBuffers[myparent.dbNodeKey]);
                            obj.audioBuffers[myparent.dbNodeKey] = '';
                        }
                    } else {
                        // Forward non-chunked audio data directly
                        obj.forwardAudioData(myparent.dbNodeKey, req.data);
                    }
                    break;
                    
                case 'streamError':
                    obj.debug('PLUGIN', 'MicStream', 'Stream error from node: ' + myparent.dbNodeKey + ' - ' + req.error);
                    break;
                    
                case 'streamStarted':
                    obj.debug('PLUGIN', 'MicStream', 'Stream started on node: ' + myparent.dbNodeKey);
                    obj.activeStreams[myparent.dbNodeKey] = {
                        micId: req.micId,
                        bitrate: req.bitrate,
                        startTime: Date.now()
                    };
                    break;
                    
                case 'streamStopped':
                    obj.debug('PLUGIN', 'MicStream', 'Stream stopped on node: ' + myparent.dbNodeKey);
                    delete obj.activeStreams[myparent.dbNodeKey];
                    break;
            }
            
            return true; // Indicate we handled this message
        }
        return false; // Let other handlers process
    };
    
    // Hook for handling commands from web UI
    obj.serveraction = function(req, res, func) {
        if (req.action === 'plugin' && req.plugin === 'micstream') {
            var result = obj.handleCommand(req);
            if (func) func(result);
            return true;
        }
        return false;
    };
    
    // Hook for handling plugin commands from web UI
    obj.hook_setupHttpHandlers = function() {
        // Setup custom HTTP handler if needed
    };
    
    // Handle commands from web UI via meshserver
    obj.handleCommand = function(req) {
        switch (req.pluginaction) {
            case 'getMicList':
                var nodeId = req.nodeid;
                if (obj.meshServer.micstream_micLists && obj.meshServer.micstream_micLists[nodeId]) {
                    return { success: true, mics: obj.meshServer.micstream_micLists[nodeId] };
                } else {
                    return { success: true, mics: [] };
                }
                
            case 'startStream':
                var nodeId = req.nodeid;
                var micId = req.micId;
                var bitrate = parseInt(req.bitrate);
                
                // Send command to agent
                if (obj.meshServer.webserver.wsagents && obj.meshServer.webserver.wsagents[nodeId]) {
                    try {
                        obj.meshServer.webserver.wsagents[nodeId].send(JSON.stringify({
                            action: 'plugin',
                            plugin: 'micstream',
                            pluginaction: 'startStream',
                            micId: micId,
                            bitrate: bitrate
                        }));
                        return { success: true };
                    } catch (e) {
                        return { success: false, error: 'Failed to send command to agent' };
                    }
                } else {
                    return { success: false, error: 'Agent not connected' };
                }
                
            case 'stopStream':
                var nodeId = req.nodeid;
                
                if (obj.meshServer.webserver.wsagents && obj.meshServer.webserver.wsagents[nodeId]) {
                    try {
                        obj.meshServer.webserver.wsagents[nodeId].send(JSON.stringify({
                            action: 'plugin',
                            plugin: 'micstream',
                            pluginaction: 'stopStream'
                        }));
                        return { success: true };
                    } catch (e) {
                        return { success: false, error: 'Failed to send command to agent' };
                    }
                } else {
                    return { success: false, error: 'Agent not connected' };
                }
                
            default:
                return { success: false, error: 'Unknown command' };
        }
    };
    
    // Forward audio data to web clients
    obj.forwardAudioData = function(nodeId, audioData) {
        // Broadcast to all connected web clients for this node
        if (obj.meshServer.webserver && obj.meshServer.webserver.wssessions) {
            Object.keys(obj.meshServer.webserver.wssessions).forEach(function(sessionId) {
                try {
                    var session = obj.meshServer.webserver.wssessions[sessionId];
                    if (session.micstream_currentNode === nodeId && session.micstream_listening) {
                        session.send(JSON.stringify({
                            action: 'plugin',
                            plugin: 'micstream',
                            pluginaction: 'audioData',
                            data: audioData
                        }));
                    }
                } catch (e) {
                    obj.debug('PLUGIN', 'MicStream', 'Error forwarding audio: ' + e);
                }
            });
        }
    };
    
    // Web UI startup hook
    obj.onWebUIStartupEnd = function() {
        // Try multiple selectors for device actions
        var selectors = [
            '#p2DeviceActions > p.mL',
            '#p2DeviceActions',
            '.device-actions',
            '#deviceActions'
        ];
        
        var added = false;
        selectors.forEach(function(selector) {
            var ld = document.querySelectorAll(selector)[0];
            if (ld && !added) {
                var as = Q('plugin_micstreamAction');
                if (as) as.parentNode.removeChild(as);
                var x = '<span id="plugin_micstreamAction" style="display: block; margin: 5px 0;"><a onclick="pluginHandler.micstream.openMicStream();" style="cursor: pointer; color: #0066cc;">🎤 Microphone Stream</a></span>';
                ld.innerHTML += x;
                added = true;
                console.log('MicStream: Added to device actions using selector: ' + selector);
            }
        });
        
        if (!added) {
            console.log('MicStream: Could not find device actions container, adding to main page');
            // Fallback: Add to main page content
            var mainContent = document.querySelector('#p2') || document.querySelector('.main-content');
            if (mainContent) {
                var button = document.createElement('div');
                button.id = 'plugin_micstreamButton';
                button.innerHTML = '<button onclick="pluginHandler.micstream.openMicStream();" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 5px; cursor: pointer; margin: 10px;">🎤 Microphone Stream</button>';
                mainContent.insertBefore(button, mainContent.firstChild);
            }
        }
        
        // Add handler for server responses
        if (typeof onServerMessage !== 'undefined') {
            var originalHandler = onServerMessage;
            onServerMessage = function(msg) {
                if (originalHandler) originalHandler(msg);
                pluginHandler.micstream.handleServerResponse(msg);
            };
        }
        
        // Add quick toggle button
        pluginHandler.micstream.addQuickToggleButton();
    };
    
    // Device refresh hook
    obj.onDeviceRefreshEnd = function() {
        // Update UI when device is selected
        pluginHandler.micstream.updateMicList();
        
        // Ensure button is visible when device is selected
        var button = Q('plugin_micstreamButton');
        if (button && currentNode) {
            button.style.display = 'block';
        }
    };
    
    // Open microphone stream interface
    obj.openMicStream = function() {
        if (currentNode == null) {
            alert('No device selected');
            return;
        }
        
        let spage = `<div id="micStreamPanel" style="height:100%;">
            <div><div class="backButton" tabindex=0 onclick="go(2);" title="Back" onkeypress="if (event.key == 'Enter') go(2);"><div class="backButtonEx"></div></div></div>
            <h1>Device Actions - <span>Microphone Stream</span></h1>
            <div class="p10html3" style="padding: 20px;">
                <div id="micStreamControls">
                    <h3>Microphone Selection</h3>
                    <select id="micSelect" style="width: 100%; max-width: 400px; padding: 8px; margin-bottom: 15px;">
                        <option value="">Loading microphones...</option>
                    </select>
                    
                    <h3>Bitrate Configuration</h3>
                    <select id="bitrateSelect" style="width: 100%; max-width: 400px; padding: 8px; margin-bottom: 15px;">
                        <option value="64000">64 kbps (Low quality)</option>
                        <option value="128000" selected>128 kbps (Medium quality)</option>
                        <option value="256000">256 kbps (High quality)</option>
                        <option value="320000">320 kbps (Very high quality)</option>
                    </select>
                    
                    <div style="margin-top: 20px;">
                        <button id="startStreamBtn" onclick="pluginHandler.micstream.startStreaming();" style="padding: 10px 20px; margin-right: 10px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer;">🎤 Start Streaming</button>
                        <button id="stopStreamBtn" onclick="pluginHandler.micstream.stopStreaming();" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 5px; cursor: pointer; display: none;">⏹️ Stop Streaming</button>
                    </div>
                    
                    <div id="streamStatus" style="margin-top: 20px; padding: 10px; background: #f0f0f0; border-radius: 5px; display: none;">
                        <strong>Status:</strong> <span id="statusText">Not streaming</span>
                    </div>
                    
                    <div id="audioPlayer" style="margin-top: 20px; display: none;">
                        <h3>Audio Output</h3>
                        <audio id="audioElement" controls autoplay style="width: 100%; max-width: 400px;"></audio>
                    </div>
                </div>
            </div>
        </div>`;
        
        QV('p2', 0);
        xxcurrentView = null;
        document.getElementById('column_l').insertAdjacentHTML('beforeend', spage);
        
        // Request microphone list from server
        pluginHandler.micstream.updateMicList();
    };
    
    // Add a quick toggle button to the main interface
    obj.addQuickToggleButton = function() {
        // Add to the main page toolbar if it exists
        var toolbar = document.querySelector('.toolbar') || document.querySelector('.main-toolbar') || document.querySelector('#toolbar');
        if (toolbar) {
            var toggleBtn = document.createElement('button');
            toggleBtn.id = 'micStreamToggle';
            toggleBtn.innerHTML = '🎤 Mic';
            toggleBtn.style.cssText = 'padding: 5px 10px; margin-left: 10px; background: #007bff; color: white; border: none; border-radius: 3px; cursor: pointer;';
            toggleBtn.onclick = function() {
                pluginHandler.micstream.openMicStream();
            };
            toolbar.appendChild(toggleBtn);
        }
    };
    
    // Update microphone list from server
    obj.updateMicList = function() {
        if (currentNode == null) return;
        
        // Request microphone list via meshserver
        meshserver.send({
            action: 'plugin',
            plugin: 'micstream',
            pluginaction: 'getMicList',
            nodeid: currentNode._id
        }, function(response) {
            if (response && response.success) {
                pluginHandler.micstream.handleMicListResponse(response.mics);
            }
        });
    };
    
    // Handle microphone list response from server
    obj.handleMicListResponse = function(mics) {
        var select = Q('micSelect');
        if (!select) return;
        
        select.innerHTML = '';
        if (mics && mics.length > 0) {
            mics.forEach(function(mic, index) {
                var option = document.createElement('option');
                option.value = mic.id;
                option.text = mic.name || 'Microphone ' + (index + 1);
                select.appendChild(option);
            });
        } else {
            var option = document.createElement('option');
            option.value = '';
            option.text = 'No microphones found';
            select.appendChild(option);
        }
    };
    
    // Handle server responses in web UI
    obj.handleServerResponse = function(msg) {
        if (msg.action === 'plugin' && msg.plugin === 'micstream') {
            switch (msg.pluginaction) {
                case 'micList':
                    pluginHandler.micstream.handleMicListResponse(msg.mics);
                    break;
                case 'streamStarted':
                    Q('statusText').textContent = 'Streaming active';
                    break;
                case 'streamStopped':
                    Q('statusText').textContent = 'Stream stopped';
                    break;
                case 'streamError':
                    Q('statusText').textContent = 'Error: ' + msg.error;
                    break;
            }
        }
    };
    
    // Start streaming
    obj.startStreaming = function() {
        if (currentNode == null) {
            alert('No device selected');
            return;
        }
        
        var micId = Q('micSelect').value;
        var bitrate = parseInt(Q('bitrateSelect').value);
        
        if (!micId) {
            alert('Please select a microphone');
            return;
        }
        
        // Set current node for audio routing
        if (obj.meshServer.webserver && obj.meshServer.webserver.wssessions) {
            var sessionId = Object.keys(obj.meshServer.webserver.wssessions)[0];
            if (sessionId) {
                obj.meshServer.webserver.wssessions[sessionId].micstream_currentNode = currentNode._id;
                obj.meshServer.webserver.wssessions[sessionId].micstream_listening = true;
            }
        }
        
        // Send command via meshserver
        meshserver.send({
            action: 'plugin',
            plugin: 'micstream',
            pluginaction: 'startStream',
            nodeid: currentNode._id,
            micId: micId,
            bitrate: bitrate
        }, function(response) {
            if (response && response.success) {
                // Update UI
                Q('startStreamBtn').style.display = 'none';
                Q('stopStreamBtn').style.display = 'inline-block';
                Q('streamStatus').style.display = 'block';
                Q('statusText').textContent = 'Starting stream...';
                Q('audioPlayer').style.display = 'block';
            } else {
                alert('Failed to start stream: ' + (response ? response.error : 'Unknown error'));
            }
        });
    };
    
    // Stop streaming
    obj.stopStreaming = function() {
        if (currentNode == null) return;
        
        // Clear listening state
        if (obj.meshServer.webserver && obj.meshServer.webserver.wssessions) {
            Object.keys(obj.meshServer.webserver.wssessions).forEach(function(sessionId) {
                obj.meshServer.webserver.wssessions[sessionId].micstream_listening = false;
            });
        }
        
        // Send command via meshserver
        meshserver.send({
            action: 'plugin',
            plugin: 'micstream',
            pluginaction: 'stopStream',
            nodeid: currentNode._id
        }, function(response) {
            // Update UI regardless of response
            Q('startStreamBtn').style.display = 'inline-block';
            Q('stopStreamBtn').style.display = 'none';
            Q('statusText').textContent = 'Not streaming';
            Q('audioPlayer').style.display = 'none';
            
            // Stop audio playback
            var audio = Q('audioElement');
            if (audio) {
                audio.pause();
                audio.src = '';
            }
        });
    };
    
    // Handle audio data from server
    obj.handleAudioData = function(data) {
        var audio = Q('audioElement');
        if (!audio) return;
        
        // Convert base64 data to blob and play
        try {
            var binaryString = atob(data);
            var bytes = new Uint8Array(binaryString.length);
            for (var i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            var blob = new Blob([bytes], { type: 'audio/webm' });
            var url = URL.createObjectURL(blob);
            
            audio.src = url;
            audio.play();
        } catch (e) {
            console.error('Error playing audio:', e);
        }
    };
    
    // Handle HTTP requests for plugin
    obj.handleAdminReq = function(req, res, user) {
        // This could be used for additional admin functionality
        res.sendStatus(404);
        return;
    };
    
    return obj;
};