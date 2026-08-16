'use strict'


import {Coordinates,GlobeView,CameraUtils,VIEW_EVENTS,Fetcher,WMTSSource,TMSSource,ColorLayer,ElevationLayer,GpxParser,GLOBE_VIEW_EVENTS} from 'itowns';
import bsCustomFileInput from 'bs-custom-file-input';
import {Easing} from '@tweenjs/tween.js';
import {Vector3,CatmullRomCurve3,TubeGeometry,BufferGeometry,MeshBasicMaterial,Mesh,SphereGeometry,AdditiveBlending} from 'three';


// For a dynamic file input in menu
bsCustomFileInput.init();


// Global variables
const beginBtn = document.getElementById('beginBtn');
const fileInput = document.getElementById('fileInput');
const menuContainer = document.getElementById('menuContainer');
const viewerDiv = document.getElementById('viewerDiv');
const ITOWNS_GPX_PARSER_OPTIONS = { in: { crs: 'EPSG:4326' } , out: { crs: 'EPSG:4326' , mergeFeatures: true } };
let FOLLOWING_CAMERA_TILT = 27;
const STEP_NB_GEOMETRY_POSITIONS_3D_WAY = 100;
const INITIAL_CAMERA_TRAVEL_TIME = 15000;
const UPDATE_CAMERA_TIME = 700;
let TRACE_GPX_UPDATE_TIME = 40;
let CAMERA_HEIGHT_OFFSET = 5000;

let currGeometryPosition=0;
let iterationNumerinUpdateFollowingCamera = 0;
let setIntervalToDraw3DWay;
let setIntervalUpdateFollowingCamera;
let currentDrawingPoint;
let previousCurrentDrawingPoint;
let newDrawingPoint;
let view;
let loadingScreenContainer;


// Listen start button
beginBtn.addEventListener('click', onBegin);


let hasBegun = false;

// On user start, decide if launch activity with chosen GPX file or default one
function onBegin() {

    // Guard against double-click / double-trigger launching two overlapping traces
    if (hasBegun) return;
    hasBegun = true;
    beginBtn.disabled = true;

    // Take in count the GPX file if user inputed one
    if(fileInput.value!="") beginActivity(fileInput.files[0]);

    // If not, default GPX
    else    beginActivity(undefined);
}


// Pass from menu to loader screen
function beginActivity(gpxFile) {

    // Remove menu and add necessary style for the viewerDiv of itowns
    menuContainer.remove();
    viewerDiv.classList.add("viewerDiv");
    document.body.style="overflow: hidden; height:100%;";

    // Display loading screen
    setupLoadingScreen();

    // Launch te parse process of the inputed GPX file
    parseGPXFile(gpxFile);
}


// Parse chosen GPX file or fetch the default one
function parseGPXFile(gpxFile) {

    // Code repetition is mandatory here

    if (gpxFile) {
        // Read the file gave in put

        // Use Vanilla JS FileReader
        let reader = new FileReader();
        reader.readAsText(gpxFile);

        reader.onloadend = function(){

            // Use Vanilla JS DOMParser
            let parser = new DOMParser();
            let GPXXMLFile = parser.parseFromString(reader.result,"text/xml");

            GpxParser.parse(GPXXMLFile,ITOWNS_GPX_PARSER_OPTIONS)
            .then(parsedGPX =>{
                // On GPX parsed

                // Init the itowns globe
                init3DMap();

                // Set up the environment on the GPX starting point
                const allGPXcoord = parsedGPX.features[0].vertices;
                setUpEnvironmentAnd3DWay(allGPXcoord);

            })
        }
    }
    else{
        // Use deafult GPX file store in a static file
        // (set to the current working track: Boucle 4 jours Haute Ariège / Andorre,
        // 53.9km, D+3639m, so "Démarrer" without upload previews this route directly)

        Fetcher.xml('./gpx/COURSE_500085875.gpx')
        .then(gpx => GpxParser.parse(gpx,ITOWNS_GPX_PARSER_OPTIONS))
        .then(parsedGPX =>{
            // On GPX parsed

            // Init the itowns globe
            init3DMap();

            // Set up the environment on the GPX starting point
            const allGPXcoord = parsedGPX.features[0].vertices;
            setUpEnvironmentAnd3DWay(allGPXcoord);

        })
    }
}


let restartStartCoord, restartSecondCoord;
let traceGeneration = 0; // Incremented on every restart; stale scheduled ticks from
                          // before a restart check this and self-cancel instead of
                          // running alongside the new (freshly reset) animation.

// Restart the trace animation from the beginning: stop timers, reset drawing
// state and geometries, move camera back to the start point and relaunch.
function restartTrace() {

    // Invalidate any pending/stale timer from the previous run
    traceGeneration++;

    // Stop any running animation loop
    clearTimeout(setIntervalToDraw3DWay);
    clearInterval(setIntervalUpdateFollowingCamera);

    // Reset drawing state
    currGeometryPosition = 0;
    iterationNumerinUpdateFollowingCamera = 0;
    previousCurrentDrawingPoint = undefined;
    currentDrawingPoint = new Vector3(view.way.geometry.attributes.position.array[0],
                                        view.way.geometry.attributes.position.array[1],
                                        view.way.geometry.attributes.position.array[2]
    );

    // Hide the line again
    view.way.geometry.setDrawRange(0,0);
    view.way.geometry.verticesNeedUpdate = true;
    view.notifyChange();

    // Move camera back to the start point, north-up, then relaunch the trace
    const myGeneration = traceGeneration;
    const followingCameraPathFirstPosition = {
        coord: restartStartCoord,
        range: restartStartCoord.altitude + CAMERA_HEIGHT_OFFSET,
        time:  INITIAL_CAMERA_TRAVEL_TIME,
        tilt: FOLLOWING_CAMERA_TILT,
        heading: 0,
        easing:Easing.Quartic.Out
    }
    cameraTravel(followingCameraPathFirstPosition).then(() => {
        // If restartTrace was clicked again during this camera travel, a newer
        // generation is already running: don't start a second, duplicate one.
        if (myGeneration !== traceGeneration) return;
        setTimeout(() => { if (myGeneration === traceGeneration) onCameraReadyToBegin(); }, 1000);
    });
}

// Set up the environment on the GPX starting point
function setUpEnvironmentAnd3DWay(allGPXcoord) {

    // Get first, second and last coord from GPX
    const startCoord = new Coordinates('EPSG:4326',allGPXcoord[0],allGPXcoord[1],allGPXcoord[2]+10);
    const secondCoord = new Coordinates('EPSG:4326',allGPXcoord[3],allGPXcoord[4],allGPXcoord[5]+10);
    const endCoord = new Coordinates('EPSG:4326',allGPXcoord[allGPXcoord.length-3],allGPXcoord[allGPXcoord.length-2],allGPXcoord[allGPXcoord.length-1]+10);
    restartStartCoord = startCoord;
    restartSecondCoord = secondCoord;

    // Add green sphere at start
    const startVec3 = startCoord.as(view.referenceCrs).toVector3();
    addSphere(startVec3,0x21b710);

    // Add white sphere at end - but skip it if the track is a loop (start ≈ end,
    // e.g. "Boucle de 4 jours"), otherwise the two spheres overlap/z-fight on the
    // same trailhead instead of marking two distinct points.
    const endVec3 = endCoord.as(view.referenceCrs).toVector3();
    const LOOP_DISTANCE_THRESHOLD = 150; // meters - below this, start/end are the same trailhead
    if (startVec3.distanceTo(endVec3) > LOOP_DISTANCE_THRESHOLD) {
        addSphere(endVec3,0xffffff);
    }

    // Set up the 3D way (but not display it)
    setUp3DWay(allGPXcoord);

    // Wait a little after loading screen hide => brutal otherwise
    setTimeout(() => {

        const followingCameraPathFirstPosition = { 
            coord: startCoord, 
            range: startCoord.altitude + CAMERA_HEIGHT_OFFSET, 
            time:  INITIAL_CAMERA_TRAVEL_TIME,  
            tilt: FOLLOWING_CAMERA_TILT, 
            heading: 0, // North-up on start, camera will follow the route heading once the trace begins
            easing:Easing.Quartic.Out
        }
        
        // Start camera moove to init point to starting gpx point
        cameraTravel(followingCameraPathFirstPosition).then(() => {

            // When camera is settled and ready to begin => wait a little after camera positioned
            setTimeout(onCameraReadyToBegin, 3000);
    
        });
        
    }, 1000);

}


// When camera set up on the start point => trace can begin
function onCameraReadyToBegin() {

    // Trace gpx every TRACE_GPX_UPDATE_TIME miliseconds
    setIntervalToDraw3DWay = setTimeout(() => traceGPXLoop(traceGeneration), TRACE_GPX_UPDATE_TIME);

    // Update camera every UPDATE_CAMERA_TIME miliseconds
    setIntervalUpdateFollowingCamera = setInterval(updateFollowingCamera, UPDATE_CAMERA_TIME);
    
}


// Initialize 3D map by defining initial placement and loading the globe
function init3DMap() {

    const initialPlacement = {
        coord: new Coordinates('EPSG:4326', 2.351323, 48.856712),
        range: 25000000,
    }

    // Init itowns globe
    view = new GlobeView(viewerDiv, initialPlacement);
    let atmosphere = view.getLayerById('atmosphere');
    atmosphere.setRealisticOn(false);

    // Hide loader and display globe when initialized or after 5 sec
    view.addEventListener(GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, hideLoader);
    view.addEventListener(GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, initCinematicOverlay);
    view.addEventListener(GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, initVideoExport);
    view.addEventListener(GLOBE_VIEW_EVENTS.GLOBE_INITIALIZED, initLiveControls);
    setTimeout(hideLoader, 5000);

    // Display layers on the itowns globe

    // World fallback imagery (covers areas outside France, e.g. Andorra,
    // where the IGN layer below has no data). Added first so it sits underneath.
    Fetcher.json('./layers/JSONLayers/WorldImageryFallback.json').then(function _(config) {
        config.source = new TMSSource(config.source);
        let layer = new ColorLayer('WorldImageryFallback', config);
        view.addLayer(layer);
    });

    Fetcher.json('./layers/JSONLayers/Ortho.json').then(function _(config) {
        config.source = new WMTSSource(config.source);
        let layer = new ColorLayer('Ortho', config);
        view.addLayer(layer);
    });
    function addElevationLayerFromConfig(config) {
        config.source = new WMTSSource(config.source);
        let layer = new ElevationLayer(config.id, config);
        view.addLayer(layer);
    }
    Fetcher.json('./layers/JSONLayers/WORLD_DTM.json').then(addElevationLayerFromConfig);
    Fetcher.json('./layers/JSONLayers/IGN_MNT_HIGHRES.json').then(addElevationLayerFromConfig);
}


// Update parameters of the following camera to follow the 3D trace
let fixedCameraMode = true; // Default: static north-facing view, no auto-follow

// Update parameters of the following camera to follow the 3D trace
function updateFollowingCamera() {

    // Fixed camera mode: skip automatic camera movement so the user can
    // freely navigate with the mouse while the route keeps drawing
    if (fixedCameraMode) return;

    // Compute new camera position ccording to currentDrawingPoint
    const desiredCameraPositionIn4326 = new Coordinates(view.referenceCrs,currentDrawingPoint).as('EPSG:4326');

    let cameraParameters;
    let newHeading = null;

    if (previousCurrentDrawingPoint) {

        // Compute last currentDrawingPoint position
        const previousCurrentDrawingPointCoord = new Coordinates(view.referenceCrs,previousCurrentDrawingPoint).as('EPSG:4326');

        iterationNumerinUpdateFollowingCamera++

        // One time out of five in this function, heading will be update to prevent camera to do too much backflips
        if (iterationNumerinUpdateFollowingCamera==5) {
            // Update heading poition

            // Compute heading => null otherwise
            newHeading = calculateHeadingBetweenTwoCoord4326(previousCurrentDrawingPointCoord,desiredCameraPositionIn4326);

            iterationNumerinUpdateFollowingCamera=0;
        }
    }

    // Update previousCurrentDrawingPoint
    previousCurrentDrawingPoint = currentDrawingPoint;

    cameraParameters = {
        coord: desiredCameraPositionIn4326, 
        range: desiredCameraPositionIn4326.altitude+CAMERA_HEIGHT_OFFSET, 
        time:  UPDATE_CAMERA_TIME,
        tilt: FOLLOWING_CAMERA_TILT,
        heading:newHeading,
        easing:Easing.Linear.None
    }

    // Give order to camera to travel to a new oition (and one time out of 5 update heading)
    cameraTravel(cameraParameters);
}


// Init 3D way
function setUp3DWay(vertices) {

    // Add all GPX coord in a array
    let coordList=[];
    for (let i = 0; i < vertices.length/3; i++) {
        coordList.push(new Coordinates('EPSG:4326',vertices[i*3],vertices[i*3+1],vertices[i*3+2]+5).as(view.referenceCrs).toVector3());
    }

    // Create 3d way path and geometry of the 3d way
    const pipeSpline = new CatmullRomCurve3( coordList );
    // Cap tubular segments: coordList.length*10 explodes with long/dense tracks, especially
    // combined with the legacy fromGeometry() conversion (which triples vertex count by
    // un-sharing every triangle - see below).
    // Raised from 4000 to 10000: for this track (~9800 raw GPX points, ~5.5m average
    // spacing, several tight GR10-style switchbacks around 2300-2550m), 4000 segments
    // under-resolved the hairpins (~13.5m/segment, wider than the raw GPS sampling).
    // 10000 segments (~5.4m/segment) matches the input density and keeps the mountain
    // switchbacks crisp. Worst case for THIS track: 10000*8*2*3 ≈ 480k vertices for a
    // single unlit MeshBasicMaterial line - trivial for any WebGL-capable browser/GPU.
    // The cap still protects much longer/denser tracks from an unbounded build cost.
    const TUBULAR_SEGMENTS = Math.min(coordList.length*10, 10000);
    let geometry = new TubeGeometry( pipeSpline,TUBULAR_SEGMENTS,10,8, false );
    geometry = new BufferGeometry().fromGeometry( geometry );

    // Do not display the geometry
    geometry.setDrawRange(0,0);

    // Init currentDrawingPoint
    currentDrawingPoint=new Vector3(geometry.attributes.position.array[0],
                                    geometry.attributes.position.array[1],
                                    geometry.attributes.position.array[2]
    );
    
    geometry.attributes.position.needsUpdate = true;

    // Rose fluo (fluorescent pink), style "Clem Qui Court" - previously
    // 0xff1493 (DeepPink), which leans more magenta/purple. This is the
    // standard "fluorescent pink" web color: more saturated and pink-forward.
    const NEON_COLOR = 0xff08e8;

    // Create mesh (single clean line, no glow layers - the multi-tube glow
    // hack caused visual duplication artifacts on winding trails, removed)
    const material = new MeshBasicMaterial( { color: NEON_COLOR } );
    const mesh = new Mesh( geometry, material );

    // update coordinate of the mesh
    mesh.updateMatrixWorld();

    // add the mesh to the scene
    view.scene.add(mesh);
    view.way=mesh;

    // Notify view to update
    view.notifyChange();
}


// Reschedule loop for traceGPX, reading TRACE_GPX_UPDATE_TIME live each tick
// so the speed slider takes effect immediately without restarting the animation
function traceGPXLoop(myGeneration) {
    if (myGeneration !== traceGeneration) return; // a restart happened, stop this stale loop
    traceGPX();
    if (currGeometryPosition < view.way.geometry.attributes.position.count - 1) {
        setIntervalToDraw3DWay = setTimeout(() => traceGPXLoop(myGeneration), TRACE_GPX_UPDATE_TIME);
    }
}


// Trace 3D way
function traceGPX() {

    if (currGeometryPosition>=view.way.geometry.attributes.position.count) {
        // End of drawing => finish trace and update of following camera

        clearTimeout(setIntervalToDraw3DWay);
        clearInterval(setIntervalUpdateFollowingCamera);

        return;
    }

    // Update currGeometryPosition, clamped to the last valid vertex index so a
    // large STEP (esp. at high speed) can't overshoot the array on the final tick
    // and read undefined/NaN values, which sent the camera to a garbage location
    const maxValidPosition = view.way.geometry.attributes.position.count - 1;
    currGeometryPosition = Math.min(currGeometryPosition + STEP_NB_GEOMETRY_POSITIONS_3D_WAY, maxValidPosition);

    // Compute new drawing point
    newDrawingPoint = new Vector3(view.way.geometry.attributes.position.array[currGeometryPosition*3],
                                    view.way.geometry.attributes.position.array[currGeometryPosition*3+1],
                                    view.way.geometry.attributes.position.array[currGeometryPosition*3+2]
    );

    // If the new point is too close (<50) from the precendent => no display
    if (newDrawingPoint.distanceTo(currentDrawingPoint)<50)     traceGPX();

    // If it is okay => update
    currentDrawingPoint = newDrawingPoint;

    // And update mesh to display until the choosen point
    view.way.geometry.setDrawRange(0,currGeometryPosition);
    view.way.geometry.verticesNeedUpdate=true;
    view.notifyChange();
}


// Add a shere to 3D map
function addSphere(coord,color) {

    let geometry = new SphereGeometry( 20, 32, 32 );
    let material = new MeshBasicMaterial({ color: color });
    let mesh = new Mesh(geometry, material);

    // position and orientation of the mesh
    mesh.position.copy(coord);

    // update coordinate of the mesh
    mesh.updateMatrixWorld();

    // add the mesh to the scene
    view.scene.add(mesh);

    // Notify view to update
    view.notifyChange();
}


// Camera travel with one point
function cameraTravel(travelPathParam) {
    return CameraUtils.sequenceAnimationsToLookAtTarget(view, view.camera.camera3D, [travelPathParam]);
}


// Calculate heading between to coordinates in 4326
function calculateHeadingBetweenTwoCoord4326(coord1,coord2){

    let X = Math.cos(coord2.longitude * Math.PI / 180) *
        Math.sin((coord2.latitude - coord1.latitude) * Math.PI / 180);

    let Y = Math.cos(coord1.longitude * Math.PI / 180)*
        Math.sin(coord2.longitude * Math.PI / 180) -
        Math.sin(coord1.longitude * Math.PI / 180) *
        Math.cos(coord2.longitude * Math.PI / 180) *
        Math.cos((coord2.latitude - coord1.latitude) * Math.PI / 180);

    let beta = Math.atan2(X,Y) * 180 / Math.PI;

    return beta - 90;
}


// Display the loader screen
function setupLoadingScreen() {

    loadingScreenContainer = document.createElement('div');
    let img = new Image(200,200);
    img.classList.add("loading-image");
    img.onload = function() {
        loadingScreenContainer.appendChild(img);
    }
    img.src = './assets/logo.png';
    loadingScreenContainer.id = 'itowns-loader';
    viewerDiv.appendChild(loadingScreenContainer);
}


// Hide the loader screen
function hideLoader() {
    if (!loadingScreenContainer)    return;

    loadingScreenContainer.style.opacity = 0;
    loadingScreenContainer.style.pointerEvents = 'none';
    loadingScreenContainer.style.transition = 'opacity 0.5s cubic-bezier(0.55, 0.085, 0.68, 0.53)';

    loadingScreenContainer.addEventListener('transitionend', function _(e) {
        viewerDiv.removeChild(e.target);
    })

    loadingScreenContainer = null;
}


// Wire the live control sliders (speed, camera tilt, camera height) to the
// tunable variables. Camera tilt/height are read live each camera update,
// so changes apply immediately without restarting the animation.
function initLiveControls() {
    const speedSlider = document.getElementById('speedSlider');
    const tiltSlider = document.getElementById('tiltSlider');
    const heightSlider = document.getElementById('heightSlider');
    const speedValue = document.getElementById('speedValue');
    const tiltValue = document.getElementById('tiltValue');
    const heightValue = document.getElementById('heightValue');
    if (!speedSlider) return;

    function refreshLabels() {
        // Speed slider is inverted: lower ms = faster, so display as a 1-10 scale
        speedValue.textContent = Math.round((205 - speedSlider.value) / 20) + '/10';
        tiltValue.textContent = tiltSlider.value + '°';
        heightValue.textContent = heightSlider.value + 'm';
    }

    const fixedCamCheckbox = document.getElementById('fixedCamCheckbox');

    speedSlider.addEventListener('input', function () {
        TRACE_GPX_UPDATE_TIME = Number(speedSlider.value);
        refreshLabels();
    });
    tiltSlider.addEventListener('input', function () {
        FOLLOWING_CAMERA_TILT = Number(tiltSlider.value);
        refreshLabels();
    });
    heightSlider.addEventListener('input', function () {
        CAMERA_HEIGHT_OFFSET = Number(heightSlider.value);
        refreshLabels();
    });
    fixedCamCheckbox.addEventListener('change', function () {
        fixedCameraMode = fixedCamCheckbox.checked;
    });

    // Color-grade effects (hiver / nuit) are combined into a single filter
    // string and applied via inline style, not CSS classes: CSS filter
    // functions chain when listed together in one property value, so this
    // is the only way to let both effects stack correctly if toggled at once.
    const WINTER_FILTER = 'brightness(1.12) contrast(1.15) saturate(0.55)';

    const winterCheckbox = document.getElementById('winterCheckbox');

    function updateViewerFilter() {
        viewerDiv.style.filter = (winterCheckbox && winterCheckbox.checked) ? WINTER_FILTER : '';
    }

    if (winterCheckbox) winterCheckbox.addEventListener('change', updateViewerFilter);

    // Mouse wheel zoom: bound directly to CAMERA_HEIGHT_OFFSET (same variable
    // as the height slider) so it works even during auto-follow, where
    // itowns' native wheel zoom gets fought/overridden every 700ms by the
    // automatic camera travel.
    viewerDiv.addEventListener('wheel', function (e) {
        e.preventDefault();
        const step = CAMERA_HEIGHT_OFFSET * 0.12; // proportional so it feels natural at any zoom level
        CAMERA_HEIGHT_OFFSET = Math.max(200, Math.min(20000, CAMERA_HEIGHT_OFFSET + (e.deltaY > 0 ? step : -step)));
        heightSlider.value = Math.round(CAMERA_HEIGHT_OFFSET);
        refreshLabels();
    }, { passive: false });

    refreshLabels();
}


// Animated film grain drawn on a canvas overlay, redrawn at low fps to save CPU
function initCinematicOverlay() {
    const grainCanvas = document.getElementById('grainCanvas');
    if (!grainCanvas) return;
    const ctx = grainCanvas.getContext('2d');
    const grainCheckbox = document.getElementById('grainCheckbox');

    // Off by default: the flickering static effect looked too much like old
    // CRT TV noise for some users. Opt-in via the checkbox instead.
    let grainEnabled = grainCheckbox ? grainCheckbox.checked : false;
    grainCanvas.style.display = grainEnabled ? 'block' : 'none';
    if (grainCheckbox) {
        grainCheckbox.addEventListener('change', function () {
            grainEnabled = grainCheckbox.checked;
            grainCanvas.style.display = grainEnabled ? 'block' : 'none';
        });
    }

    // Fixed small internal resolution: the browser scales it up via CSS
    // (width/height:100% already set), massively cheaper than redrawing
    // every screen pixel every frame (was causing main-thread jank).
    grainCanvas.width = 160;
    grainCanvas.height = 90;

    function drawGrain() {
        if (!grainEnabled) return;
        const w = grainCanvas.width, h = grainCanvas.height;
        const imgData = ctx.createImageData(w, h);
        const buffer = imgData.data;
        for (let i = 0; i < buffer.length; i += 4) {
            const shade = Math.random() * 255;
            buffer[i] = shade; buffer[i+1] = shade; buffer[i+2] = shade; buffer[i+3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    // ~5fps: slow and subtle rather than a fast flicker
    setInterval(drawGrain, 200);
}


// Video export: composite the itowns WebGL canvas + vignette + grain onto an
// offscreen canvas every frame, and record that composite via MediaRecorder.
function initVideoExport() {
    const restartBtn = document.getElementById('restartBtn');
    if (restartBtn) restartBtn.addEventListener('click', restartTrace);

    const recordBtn = document.getElementById('recordBtn');
    const recordStatus = document.getElementById('recordStatus');
    if (!recordBtn) return;

    const sourceCanvas = view.mainLoop.gfxEngine.renderer.domElement;
    let compositeCanvas = null, compositeCtx = null;
    let mediaRecorder = null, recordedChunks = [], compositeRAF = null;
    let recording = false;

    function drawCompositeFrame() {
        if (!recording) return;
        const w = sourceCanvas.width, h = sourceCanvas.height;
        if (compositeCanvas.width !== w || compositeCanvas.height !== h) {
            compositeCanvas.width = w;
            compositeCanvas.height = h;
        }
        compositeCtx.drawImage(sourceCanvas, 0, 0, w, h);

        // Vignette
        const grad = compositeCtx.createRadialGradient(w/2,h/2, h*0.35, w/2,h/2, h*0.75);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.55)');
        compositeCtx.fillStyle = grad;
        compositeCtx.fillRect(0,0,w,h);

        // Grain
        compositeCtx.globalAlpha = 0.05;
        compositeCtx.globalCompositeOperation = 'overlay';
        for (let i=0;i<600;i++) {
            const shade = Math.random()*255;
            compositeCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
            compositeCtx.fillRect(Math.random()*w, Math.random()*h, 2, 2);
        }
        compositeCtx.globalAlpha = 1;
        compositeCtx.globalCompositeOperation = 'source-over';

        compositeRAF = requestAnimationFrame(drawCompositeFrame);
    }

    recordBtn.addEventListener('click', function () {
        if (!recording) {
            // Start recording
            compositeCanvas = document.createElement('canvas');
            compositeCanvas.width = sourceCanvas.width;
            compositeCanvas.height = sourceCanvas.height;
            compositeCtx = compositeCanvas.getContext('2d');

            recordedChunks = [];
            recording = true;
            drawCompositeFrame();

            const stream = compositeCanvas.captureStream(30);
            const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
                ? 'video/webm;codecs=vp9' : 'video/webm';
            mediaRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8000000 });

            mediaRecorder.ondataavailable = function (e) {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };
            mediaRecorder.onstop = function () {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'orotrace3d-export.webm';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                recordStatus.textContent = 'Vidéo téléchargée';
            };

            mediaRecorder.start();
            recordBtn.textContent = '■ Arrêter';
            recordStatus.textContent = 'Enregistrement en cours…';
        } else {
            // Stop recording
            recording = false;
            if (compositeRAF) cancelAnimationFrame(compositeRAF);
            if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
            recordBtn.textContent = '● Enregistrer la vidéo';
        }
    });
}