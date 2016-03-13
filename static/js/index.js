var target = "";
var hosts = [];
var pairingCert;
var myUniqueid;
var api;

// Called by the common.js module.
function attachListeners() {
    $('#pairButton').on('click', pairPushed);
    $('#showAppsButton').on('click', showAppsPushed);
    $('#selectResolution').on('change', saveResolution);
    $('#selectFramerate').on('change', saveFramerate);
    $('#bitrateSlider').on('input', updateBitrateField); // input occurs every notch you slide
    $('#bitrateSlider').on('change', saveBitrate); // change occurs once the mouse lets go.
    $('#startGameButton').on('click', startSelectedGame);
    $('#quitGameButton').on('click', stopGame);
    $(window).resize(fullscreenNaclModule);
}

function snackbarLog(givenMessage) {
    console.log(givenMessage);
    var data = {
      message: givenMessage,
      timeout: 5000
    };
    document.querySelector('#snackbar').MaterialSnackbar.showSnackbar(data);
}

function updateBitrateField() {
    $('#bitrateField').html($('#bitrateSlider')[0].value + " Mbps");
}

function moduleDidLoad() {
    if(!myUniqueid) {
        console.log("Failed to get uniqueId.  Generating new one");
        myUniqueid = uniqueid();
        storeData('uniqueid', myUniqueid, null);
    }

    if(!pairingCert) { // we couldn't load a cert. Make one.
        console.log("Failed to load local cert. Generating new one");   
        sendMessage('makeCert', []).then(function (cert) {
            storeData('cert', cert, null);
            pairingCert = cert;
            console.log("Generated new cert.");
        }).then(function (ret) {
            sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]);
        });
    }
    else {
        sendMessage('httpInit', [pairingCert.cert, pairingCert.privateKey, myUniqueid]).then(function (ret) {
            snackbarLog('Initialization complete.');
        });
    }
}

// because the user can change the target host at any time, we continually have to check
function updateTarget() {
    target = $('#GFEHostIPField')[0].value;
    if (target == null || target == "") {
        var e = $("#selectHost")[0];
        target = e.options[e.selectedIndex].value;
    }
}

// we want the user to progress through the streaming process
// but to save from the PITA of inter-chrome-app-page JS message passing,
// I'm opting to do it in a single page, and keep the data around.
function hideAllWorkflowDivs() {
    $('#streamSettings').css('display', 'inline-block');
    $('#hostSettings').css('display', 'inline-block');
    $('#gameSelection').css('display', 'none');
    // common.hideModule(); // do NOT hide the nacl module. you can't interact with it then
}

// pair button was pushed. pass what the user entered into the GFEHostIPField.
function pairPushed() {
    updateTarget();
    if(!pairingCert) {
        snackbarLog('ERROR: cert has not been generated yet. Is NaCL initialized?');
        console.log("User wants to pair, and we still have no cert. Problem = very yes.");
        return;
    }

    $('#pairButton')[0].innerHTML = 'Pairing...';
    snackbarLog('Attempting pair to: ' + target);
    var randomNumber = String("0000" + (Math.random()*10000|0)).slice(-4);
    var pairingDialog = document.querySelector('#pairingDialog');
    document.getElementById('pairingDialogText').innerHTML = 
        'Please enter the number ' + randomNumber + ' on the GFE dialog on the computer.  This dialog will be dismissed once complete';
    pairingDialog.showModal();
    pairingDialog.querySelector('#CancelPairingDialog').addEventListener('click', function() {
        pairingDialog.close();
    });
    console.log('sending pairing request to ' + target + ' with random number ' + randomNumber);
    sendMessage('pair', [target, randomNumber]).then(function (ret3) {
        console.log('"pair" call returned.');
        console.log(ret3);
        if (ret3 === 0) { // pairing was successful. save this host.
            $('#pairButton')[0].innerHTML = 'Paired';
            snackbarLog('Pairing successful');
            pairingDialog.close();
            var hostSelect = $('#selectHost')[0];
            for(var i = 0; i < hostSelect.length; i++) { // check if we already have the host.
                if (hostSelect.options[i].value == target) return;
            }

            var opt = document.createElement('option');
            opt.appendChild(document.createTextNode(target));
            opt.value = target;
            $('#selectHost')[0].appendChild(opt);
            hosts.push(target);
            saveHosts();
            // move directly on to retrieving the apps list.
            showAppsPushed();
        } else {
            snackbarLog('Pairing failed');
            $('#pairButton')[0].innerHTML = 'Pairing Failed';
            document.getElementById('pairingDialogText').innerHTML = 'Error: Pairing failed with code: ' + ret3;
        }
        console.log("pairing attempt returned: " + ret3);
    });
}

// someone pushed the "show apps" button. 
// if they entered something in the GFEHostIPField, use that.
// otherwise, we assume they selected from the host history dropdown.
function showAppsPushed() {
    updateTarget();
    if(!api || !api.paired) {
        api = new NvHTTP(target, myUniqueid);
    }
    api.refreshServerInfo().then(function (ret) {
        api.getAppList().then(function (appList) {
            for(var i = 0; i < appList.length; i++) { // programmatically add each app
                var opt = document.createElement('option');
                opt.appendChild(document.createTextNode(appList[i]));
                opt.value = appList[i].id;
                opt.innerHTML = appList[i].title;
                $('#selectGame')[0].appendChild(opt);
            }
            if (api.currentGame != 0) $('#selectGame')[0].value = api.currentGame;
        });
    });
    showAppsMode();
}

function showAppsMode() {
    console.log("entering show apps mode.");
    $(".mdl-layout__header").show();
    $("#main-content").children().not("#listener").show();
    $("#main-content").removeClass("fullscreen");
    $("#listener").removeClass("fullscreen");
    $("body").css('backgroundColor', 'white');
}

function startSelectedGame() {
    // do NOT update the target.
    // we're just grabbing the currently selected option from #selectGame, and feeding it into NvHTTP
    // if we need to reconnect to the target, and `target` has been updated, we can pass the appID we listed from the previous target
    // then everyone's sad. So we won't do that.  Because the only way to see the startGame button is to list the apps for the target anyways.
    if(!api || !api.paired) {
        api = new NvHTTP(target, myUniqueid);
    }
    var appID = $("#selectGame")[0].options[$("#selectGame")[0].selectedIndex].value;
    // refresh the server info, because the user might have quit the game.
    api.refreshServerInfo().then(function (ret) {
        if(api.currentGame != 0 && api.currentGame != appID) {
            api.getAppById(api.currentGame).then(function (currentApp) {
                snackbarLog('Error: ' + target + ' is already in app: ' + currentApp.title);
            });
            console.log('ERROR! host is already in an app.');
            return;
        }
        
        var frameRate = $("#selectFramerate").val();
        var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
        var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
        // we told the user it was in Mbps. We're dirty liars and use Kbps behind their back.
        var bitrate = parseInt($("#bitrateSlider").val()) * 1024;
        console.log('startRequest:' + target + ":" + streamWidth + ":" + streamHeight + ":" + frameRate + ":" + bitrate);

        var rikey = '00000000000000000000000000000000';
        var rikeyid = 0;

        if(api.currentGame == appID) // if user wants to launch the already-running app, then we resume it.
            return api.resumeApp().then(function (ret) {
                sendMessage('startRequest', [target, streamWidth, streamHeight, frameRate, bitrate.toString(), api.serverMajorVersion.toString()]);
            });

        api.launchApp(appID,
            streamWidth + "x" + streamHeight + "x" + frameRate,
            1, // Allow GFE to optimize game settings
            rikey, rikeyid,
            0, // Play audio locally too
            0x030002 // Surround channel mask << 16 | Surround channel count
            ).then(function (ret) {
                sendMessage('startRequest', [target, streamWidth, streamHeight, frameRate, bitrate.toString(), api.serverMajorVersion.toString()]);
            });
    });
    playGameMode();
}

function playGameMode() {
    console.log("entering play game mode");
    $(".mdl-layout__header").hide();
    $("#main-content").children().not("#listener").hide();
    $("#main-content").addClass("fullscreen");
    $("#listener").addClass("fullscreen");
    fullscreenNaclModule();
    $("body").css('backgroundColor', 'black');
}

// Maximize the size of the nacl module by scaling and resizing appropriately
function fullscreenNaclModule() {
    var streamWidth = $('#selectResolution option:selected').val().split(':')[0];
    var streamHeight = $('#selectResolution option:selected').val().split(':')[1];
    var screenWidth = window.innerWidth;
    var screenHeight = window.innerHeight;

    var xRatio = screenWidth / streamWidth;
    var yRatio = screenHeight / streamHeight;

    var zoom = Math.min(xRatio, yRatio);

    var module = $("#nacl_module")[0];
    module.width=zoom * streamWidth;
    module.height=zoom * streamHeight;
    module.style.paddingTop = ((screenHeight - module.height) / 2) + "px";
}

function stopGame() {
    if(!api || !api.paired) {
        api = new NvHTTP(target, myUniqueid);
    }
    api.refreshServerInfo().then(function (ret) {
        return api.quitApp();
    });
    showAppsMode();
}

function storeData(key, data, callbackFunction) {
    var obj = {};
    obj[key] = data;
    if(chrome.storage)
        chrome.storage.sync.set(obj, callbackFunction);
}

function saveResolution() {
    updateDefaultBitrate();
    storeData('resolution', $('#selectResolution').val(), null);
}

function saveFramerate() {
    updateDefaultBitrate();
    storeData('frameRate', $('#selectFramerate').val(), null);
}

function saveHosts() {
    storeData('hosts', hosts, null);
}

function saveBitrate() {
    storeData('bitrate', $('#bitrateSlider').val(), null);
}

function updateDefaultBitrate() {
    var res = $('#selectResolution').val();
    var frameRate = $('#selectFramerate').val();

    if (res.lastIndexOf("1920:1080", 0) === 0) {
        if (frameRate.lastIndexOf("30", 0) === 0) { // 1080p, 30fps
            $('#bitrateSlider')[0].MaterialSlider.change('10');
        } else { // 1080p, 60fps
            $('#bitrateSlider')[0].MaterialSlider.change('20');
        }
    } else if (res.lastIndexOf("1280:720") === 0) {
        if (frameRate.lastIndexOf("30", 0) === 0) { // 720, 30fps
            $('#bitrateSlider')[0].MaterialSlider.change('5');
        } else { // 720, 60fps
            $('#bitrateSlider')[0].MaterialSlider.change('10');
        }
    }
    updateBitrateField();
    saveBitrate();
}

function onWindowLoad(){
    // don't show the game selection div
    $('#gameSelection').css('display', 'none');
    $("#bitrateField").addClass("bitrateField");
    
    if(chrome.storage) {
        // load stored resolution prefs
        chrome.storage.sync.get('resolution', function(previousValue) {
            $('#selectResolution')[0].remove(0);
            $('#selectResolution')[0].value = previousValue.resolution != null ? previousValue.resolution : '1280:720';
        });
        // load stored framerate prefs
        chrome.storage.sync.get('frameRate', function(previousValue) {
            $('#selectFramerate')[0].remove(0);
            $('#selectFramerate')[0].value = previousValue.frameRate != null ? previousValue.frameRate : '30';
        });
        // load previously connected hosts
        chrome.storage.sync.get('hosts', function(previousValue) {
            hosts = previousValue.hosts != null ? previousValue.hosts : [];
            if ($('#selectHost')[0].length > 0) {
                $('#selectHost')[0].remove($('#selectHost')[0].selectedIndex);
            }
            for(var i = 0; i < hosts.length; i++) { // programmatically add each new host.
                var opt = document.createElement('option');
                opt.appendChild(document.createTextNode(hosts[i]));
                opt.value = hosts[i];
                $('#selectHost')[0].appendChild(opt);
            }
        });
        // load stored bitrate prefs
        chrome.storage.sync.get('bitrate', function(previousValue) {
            $('#bitrateSlider')[0].MaterialSlider.change(previousValue.bitrate != null ? previousValue.bitrate : '15');
            updateBitrateField();
        });
        // load the HTTP cert if we have one.
        chrome.storage.sync.get('cert', function(savedCert) {
            if (savedCert.cert != null) { // we have a saved cert
                pairingCert = savedCert.cert;
            }
        });
        chrome.storage.sync.get('uniqueid', function(savedUniqueid) {
            if (savedUniqueid.uniqueid != null) { // we have a saved uniqueid
                myUniqueid = savedUniqueid.uniqueid;
            }
        })
    }
}


window.onload = onWindowLoad;

