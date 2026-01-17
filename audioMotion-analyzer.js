/**!
 * audioMotion-analyzer
 * High-resolution real-time graphic audio spectrum analyzer JS module
 *
 * @version 3.6.0
 * @author  Henrique Avila Vianna <hvianna@gmail.com> <https://henriquevianna.com>
 * @license AGPL-3.0-or-later
 */

const VERSION = '3.6.0';

// internal constants
const TAU     = 2 * Math.PI,
	  HALF_PI = Math.PI / 2,
	  RPM     = TAU / 3600,           // angle increment per frame for one revolution per minute @60fps
	  ROOT24  = 2 ** ( 1 / 24 ),      // 24th root of 2
	  C0      = 440 * ROOT24 ** -114; // ~16.35 Hz

export default class AudioMotionAnalyzer {

/**
 * CONSTRUCTOR
 *
 * @param {object} [container] DOM element where to insert the analyzer; if undefined, uses the document body
 * @param {object} [options]
 * @returns {object} AudioMotionAnalyzer object
 */
	constructor( container, options = {} ) {

		this._ready = false;

		// Gradient definitions

		this._gradients = {
			classic: {
				bgColor: '#111',
				colorStops: [
					'hsl( 0, 100%, 50% )',
					{ pos: .6, color: 'hsl( 60, 100%, 50% )' },
					'hsl( 120, 100%, 50% )'
				]
			},
			prism:   {
				bgColor: '#111',
				colorStops: [
					'hsl( 0, 100%, 50% )',
					'hsl( 60, 100%, 50% )',
					'hsl( 120, 100%, 50% )',
					'hsl( 180, 100%, 50% )',
					'hsl( 240, 100%, 50% )'
				]
			},
			rainbow: {
				bgColor: '#111',
				dir: 'h',
				colorStops: [
					'hsl( 0, 100%, 50% )',
					'hsl( 60, 100%, 50% )',
					'hsl( 120, 100%, 50% )',
					'hsl( 180, 100%, 47% )',
					'hsl( 240, 100%, 58% )',
					'hsl( 300, 100%, 50% )',
					'hsl( 360, 100%, 50% )'
				]
			},
			purple: {
				bgColor: 'transparent',
				colorStops: [
					'hsl( 280, 100%, 60% )',
					'hsl( 320, 100%, 60% )',
					'hsl( 280, 100%, 40% )'
				]
			},
		};

		// Set container
		this._container = container || document.body;

		// Make sure we have minimal width and height dimensions in case of an inline container
		this._defaultWidth  = this._container.clientWidth  || 640;
		this._defaultHeight = this._container.clientHeight || 270;

		// Use audio context provided by user, or create a new one

		let audioCtx;

		if ( options.source && ( audioCtx = options.source.context ) ) {
			// get audioContext from provided source audioNode
		}
		else if ( audioCtx = options.audioCtx ) {
			// use audioContext provided by user
		}
		else {
			try {
				audioCtx = new ( window.AudioContext || window.webkitAudioContext )();
			}
			catch( err ) {
				throw new AudioMotionError( 'ERR_AUDIO_CONTEXT_FAIL', 'Could not create audio context. Web Audio API not supported?' );
			}
		}

		// make sure audioContext is valid
		if ( ! audioCtx.createGain )
			throw new AudioMotionError( 'ERR_INVALID_AUDIO_CONTEXT', 'Provided audio context is not valid' );

		// create the analyzer nodes, channel splitter and merger, and gain nodes for input/output connections
		const analyzer = this._analyzer = [ audioCtx.createAnalyser(), audioCtx.createAnalyser() ];
		const splitter = this._splitter = audioCtx.createChannelSplitter(2);
 		const merger   = this._merger   = audioCtx.createChannelMerger(2);
 		this._input    = audioCtx.createGain();
 		this._output   = audioCtx.createGain();

 		// initialize sources array and connect audio source if provided in the options
		this._sources = [];
		if ( options.source )
			this.connectInput( options.source );

 		// connect splitter -> analyzers
 		for ( const i of [0,1] )
			splitter.connect( analyzer[ i ], i );

		// connect merger -> output
		merger.connect( this._output );

		// connect output -> destination (speakers)
		this._outNodes = [];
		if ( options.connectSpeakers !== false )
			this.connectOutput();

		// initialize object to save energy
		this._energy = { val: 0, peak: 0, hold: 0 };

		// create analyzer canvas
		const canvas = document.createElement('canvas');
		canvas.style = 'max-width: 100%;';
		this._canvasCtx = canvas.getContext('2d');

		// create auxiliary canvases for the X-axis and radial scale labels
		for ( const ctx of [ '_scaleX', '_scaleR' ] )
			this[ ctx ] = document.createElement('canvas').getContext('2d');

		// set fullscreen element (defaults to canvas)
		this._fsEl = options.fsElement || canvas;

		// helper function for resize events
		const onResize = () => {
			if ( ! this._fsTimeout ) {
				this._fsTimeout = window.setTimeout( () => {
					if ( ! this._fsChanging ) {
						this._setCanvas('resize');
						this._fsTimeout = 0;
					}
				}, 60 );
			}
		}

		// if browser supports ResizeObserver, listen for resize on the container
		if ( window.ResizeObserver ) {
			const resizeObserver = new ResizeObserver( onResize );
			resizeObserver.observe( this._container );
		}

		// listen for resize events on the window
		window.addEventListener( 'resize', onResize );

		// listen for fullscreenchange events on the canvas
		canvas.addEventListener( 'fullscreenchange', () => {
			this._fsChanging = true;

			if ( this._fsTimeout )
				window.clearTimeout( this._fsTimeout );

			this._setCanvas('fschange');

			this._fsTimeout = window.setTimeout( () => {
				this._fsChanging = false;
				this._fsTimeout = 0;
			}, 60 );
		});

		// Resume audio context if in suspended state
		const unlockContext = () => {
			if ( audioCtx.state == 'suspended' )
				audioCtx.resume();
			window.removeEventListener( 'click', unlockContext );
		}
		window.addEventListener( 'click', unlockContext );

		// initialize internal variables
		this._calcAux();

		// Set configuration options and use defaults for any missing properties
		this._setProps( options, true );

		// add canvas to the container
		if ( this.useCanvas )
			this._container.appendChild( canvas );

		// Finish canvas setup
		this._ready = true;
		this._setCanvas('create');
	}

	// PUBLIC PROPERTIES GETTERS AND SETTERS

	get alphaBars() { return this._alphaBars; }
	set alphaBars( value ) { this._alphaBars = !! value; this._calcAux(); }

	get barSpace() { return this._barSpace; }
	set barSpace( value ) { this._barSpace = +value || 0; this._calcAux(); }

	get fftSize() { return this._analyzer[0].fftSize; }
	set fftSize( value ) {
		for ( const i of [0,1] ) this._analyzer[ i ].fftSize = value;
		const binCount = this._analyzer[0].frequencyBinCount;
		this._fftData = [ new Uint8Array( binCount ), new Uint8Array( binCount ) ];
		this._calcBars();
	}

	get gradient() { return this._gradient; }
	set gradient( value ) {
		if ( ! this._gradients.hasOwnProperty( value ) )
			throw new AudioMotionError( 'ERR_UNKNOWN_GRADIENT', `Unknown gradient: '${value}'` );
		this._gradient = value;
		this._makeGrad();
	}

	get height() { return this._height; }
	set height( h ) { this._height = h; this._setCanvas('user'); }

	get ledBars() { return this._showLeds; }
	set ledBars( value ) { this._showLeds = !! value; this._calcAux(); }

	get loRes() { return this._loRes; }
	set loRes( value ) { this._loRes = !! value; this._setCanvas('lores'); }

	get lumiBars() { return this._lumiBars; }
	set lumiBars( value ) {
		this._lumiBars = !! value;
		this._calcAux();
		this._calcLeds();
		this._makeGrad();
	}

	get maxDecibels() { return this._analyzer[0].maxDecibels; }
	set maxDecibels( value ) { for ( const i of [0,1] ) this._analyzer[ i ].maxDecibels = value; }

	get maxFreq() { return this._maxFreq; }
	set maxFreq( value ) {
		if ( value < 1 ) throw new AudioMotionError( 'ERR_FREQUENCY_TOO_LOW', `Frequency values must be >= 1` );
		this._maxFreq = value;
		this._calcBars();
	}

	get minDecibels() { return this._analyzer[0].minDecibels; }
	set minDecibels( value ) { for ( const i of [0,1] ) this._analyzer[ i ].minDecibels = value; }

	get minFreq() { return this._minFreq; }
	set minFreq( value ) {
		if ( value < 1 ) throw new AudioMotionError( 'ERR_FREQUENCY_TOO_LOW', `Frequency values must be >= 1` );
		this._minFreq = value;
		this._calcBars();
	}

	get mirror() { return this._mirror; }
	set mirror( value ) {
		this._mirror = Math.sign( value ) | 0;
		this._calcAux();
		this._calcBars();
		this._makeGrad();
	}

	get mode() { return this._mode; }
	set mode( value ) {
		const mode = value | 0;
		if ( mode >= 0 && mode <= 10 && mode != 9 ) {
			this._mode = mode;
			this._calcAux();
			this._calcBars();
			this._makeGrad();
		}
		else throw new AudioMotionError( 'ERR_INVALID_MODE', `Invalid mode: ${value}` );
	}

	get outlineBars() { return this._outlineBars; }
	set outlineBars( value ) { this._outlineBars = !! value; this._calcAux(); }

	get radial() { return this._radial; }
	set radial( value ) {
		this._radial = !! value;
		this._calcAux();
		this._calcBars();
		this._makeGrad();
	}

	get reflexRatio() { return this._reflexRatio; }
	set reflexRatio( value ) {
		value = +value || 0;
		if ( value < 0 || value >= 1 )
			throw new AudioMotionError( 'ERR_REFLEX_OUT_OF_RANGE', `Reflex ratio must be >= 0 and < 1` );
		this._reflexRatio = value;
		this._calcAux();
		this._makeGrad();
		this._calcLeds();
	}

	get showLeds() { return this.ledBars; }
	set showLeds( value ) { this.ledBars = value; }

	get smoothing() { return this._analyzer[0].smoothingTimeConstant; }
	set smoothing( value ) { for ( const i of [0,1] ) this._analyzer[ i ].smoothingTimeConstant = value; }

	get spinSpeed() { return this._spinSpeed; }
	set spinSpeed( value ) {
		value = +value || 0;
		if ( this._spinSpeed === undefined || value == 0 ) this._spinAngle = -HALF_PI;
		this._spinSpeed = value;
	}

	get splitGradient() { return this._splitGradient; }
	set splitGradient( value ) { this._splitGradient = !! value; this._makeGrad(); }

	get stereo() { return this._stereo; }
	set stereo( value ) {
		this._stereo = !! value;
		this._input.disconnect();
		this._input.connect( this._stereo ? this._splitter : this._analyzer[0] );
		this._analyzer[0].disconnect();
		if ( this._outNodes.length )
			this._analyzer[0].connect( this._stereo ? this._merger : this._output );
		this._calcAux();
		this._createScales();
		this._calcLeds();
		this._makeGrad();
	}

	get volume() { return this._output.gain.value; }
	set volume( value ) { this._output.gain.value = value; }

	get width() { return this._width; }
	set width( w ) { this._width = w; this._setCanvas('user'); }

	// Read only properties
	get audioCtx() { return this._input.context; }
	get canvas() { return this._canvasCtx.canvas; }
	get canvasCtx() { return this._canvasCtx; }
	get connectedSources() { return this._sources; }
	get connectedTo() { return this._outNodes; }
	get energy() { return this.getEnergy(); }
	get fps() { return this._fps; }
	get fsHeight() { return this._fsHeight; }
	get fsWidth() { return this._fsWidth; }
	get isAlphaBars() { return this._isAlphaBars; }
	get isFullscreen() { return ( document.fullscreenElement || document.webkitFullscreenElement ) === this._fsEl; }
	get isLedBars() { return this._isLedDisplay; }
	get isLedDisplay() { return this.isLedBars; }
	get isLumiBars() { return this._isLumiBars; }
	get isOctaveBands() { return this._isOctaveBands; }
	get isOn() { return this._runId !== undefined; }
	get isOutlineBars() { return this._isOutline; }
	get peakEnergy() { return this.getEnergy('peak'); }
	get pixelRatio() { return this._pixelRatio; }
	static get version() { return VERSION; }

	// PUBLIC METHODS

	connectInput( source ) {
		const isHTML = source instanceof HTMLMediaElement;
		if ( ! ( isHTML || source.connect ) )
			throw new AudioMotionError( 'ERR_INVALID_AUDIO_SOURCE', 'Audio source must be an instance of HTMLMediaElement or AudioNode' );
		const node = isHTML ? this.audioCtx.createMediaElementSource( source ) : source;
		if ( ! this._sources.includes( node ) ) {
			node.connect( this._input );
			this._sources.push( node );
		}
		return node;
	}

	connectOutput( node = this.audioCtx.destination ) {
		if ( this._outNodes.includes( node ) ) return;
		this._output.connect( node );
		this._outNodes.push( node );
		if ( this._outNodes.length == 1 ) {
			for ( const i of [0,1] )
				this._analyzer[ i ].connect( ( ! this._stereo && ! i ? this._output : this._merger ), 0, i );
		}
	}

	disconnectInput( sources ) {
		if ( ! sources ) sources = Array.from( this._sources );
		else if ( ! Array.isArray( sources ) ) sources = [ sources ];
		for ( const node of sources ) {
			const idx = this._sources.indexOf( node );
			if ( idx >= 0 ) {
				node.disconnect( this._input );
				this._sources.splice( idx, 1 );
			}
		}
	}

	disconnectOutput( node ) {
		if ( node && ! this._outNodes.includes( node ) ) return;
		this._output.disconnect( node );
		this._outNodes = node ? this._outNodes.filter( e => e !== node ) : [];
		if ( this._outNodes.length == 0 ) {
			for ( const i of [0,1] ) this._analyzer[ i ].disconnect();
		}
	}

	getBars() {
		return Array.from( this._bars, ( { posX, freqLo, freqHi, hold, peak, value } ) => ( { posX, freqLo, freqHi, hold, peak, value } ) );
	}

	getEnergy( startFreq, endFreq ) {
		if ( startFreq === undefined ) return this._energy.val;
		if ( startFreq != +startFreq ) {
			if ( startFreq == 'peak' ) return this._energy.peak;
			const presets = {
				bass:    [ 20, 250 ],
				lowMid:  [ 250, 500 ],
				mid:     [ 500, 2e3 ],
				highMid: [ 2e3, 4e3 ],
				treble:  [ 4e3, 16e3 ]
			}
			if ( ! presets[ startFreq ] ) return null;
			[ startFreq, endFreq ] = presets[ startFreq ];
		}
		const startBin = this._freqToBin( startFreq ),
		      endBin   = endFreq ? this._freqToBin( endFreq ) : startBin,
		      chnCount = this._stereo + 1;
		let energy = 0;
		for ( let channel = 0; channel < chnCount; channel++ ) {
			for ( let i = startBin; i <= endBin; i++ ) energy += this._fftData[ channel ][ i ];
		}
		return energy / ( endBin - startBin + 1 ) / chnCount / 255;
	}

	registerGradient( name, options ) {
		if ( typeof name !== 'string' || name.trim().length == 0 )
			throw new AudioMotionError( 'ERR_GRADIENT_INVALID_NAME', 'Gradient name must be a non-empty string' );
		if ( typeof options !== 'object' )
			throw new AudioMotionError( 'ERR_GRADIENT_NOT_AN_OBJECT', 'Gradient options must be an object' );
		if ( options.colorStops === undefined || options.colorStops.length < 2 )
			throw new AudioMotionError( 'ERR_GRADIENT_MISSING_COLOR', 'Gradient must define at least two colors' );
		this._gradients[ name ] = {
			bgColor:    options.bgColor || '#111',
			dir:        options.dir,
			colorStops: options.colorStops
		};
		if ( name == this._gradient ) this._makeGrad();
	}

	setCanvasSize( w, h ) {
		this._width = w;
		this._height = h;
		this._setCanvas('user');
	}

	setFreqRange( min, max ) {
		if ( min < 1 || max < 1 )
			throw new AudioMotionError( 'ERR_FREQUENCY_TOO_LOW', `Frequency values must be >= 1` );
		this._minFreq = Math.min( min, max );
		this._maxFreq = Math.max( min, max );
		this._calcBars();
	}

	setLedParams( params ) {
		let maxLeds, spaceV, spaceH;
		if ( params ) {
			maxLeds = params.maxLeds | 0;
			spaceV  = +params.spaceV;
			spaceH  = +params.spaceH;
		}
		this._ledParams = maxLeds > 0 && spaceV > 0 && spaceH >= 0 ? [ maxLeds, spaceV, spaceH ] : undefined;
		this._calcLeds();
	}

	setOptions( options ) { this._setProps( options ); }

	setSensitivity( min, max ) {
		for ( const i of [0,1] ) {
			this._analyzer[ i ].minDecibels = Math.min( min, max );
			this._analyzer[ i ].maxDecibels = Math.max( min, max );
		}
	}

	toggleAnalyzer( value ) {
		const started = this.isOn;
		if ( value === undefined ) value = ! started;
		if ( started && ! value ) {
			cancelAnimationFrame( this._runId );
			this._runId = undefined;
		}
		else if ( ! started && value ) {
			this._frame = this._fps = 0;
			this._time = performance.now();
			this._runId = requestAnimationFrame( timestamp => this._draw( timestamp ) );
		}
		return this.isOn;
	}

	toggleFullscreen() {
		if ( this.isFullscreen ) {
			if ( document.exitFullscreen ) document.exitFullscreen();
			else if ( document.webkitExitFullscreen ) document.webkitExitFullscreen();
		}
		else {
			const fsEl = this._fsEl;
			if ( fsEl.requestFullscreen ) fsEl.requestFullscreen();
			else if ( fsEl.webkitRequestFullscreen ) fsEl.webkitRequestFullscreen();
		}
	}

	// PRIVATE METHODS

	_calcAux() {
		const canvas   = this.canvas,
			  isRadial = this._radial,
			  isDual   = this._stereo && ! isRadial,
			  centerX  = canvas.width >> 1;

		this._radius         = Math.min( canvas.width, canvas.height ) * ( this._stereo ? .375 : .125 ) | 0;
		this._barSpacePx     = Math.min( this._barWidth - 1, ( this._barSpace > 0 && this._barSpace < 1 ) ? this._barWidth * this._barSpace : this._barSpace );
		this._isOctaveBands  = this._mode % 10 != 0;
		this._isLedDisplay   = this._showLeds && this._isOctaveBands && ! isRadial;
		this._isLumiBars     = this._lumiBars && this._isOctaveBands && ! isRadial;
		this._isAlphaBars    = this._alphaBars && ! this._isLumiBars && this._mode != 10;
		this._isOutline      = this._outlineBars && this._isOctaveBands && ! this._isLumiBars && ! this._isLedDisplay;
		this._maximizeLeds   = ! this._stereo || this._reflexRatio > 0 && ! this._isLumiBars;

		this._channelHeight  = canvas.height - ( isDual && ! this._isLedDisplay ? .5 : 0 ) >> isDual;
		this._analyzerHeight = this._channelHeight * ( this._isLumiBars || isRadial ? 1 : 1 - this._reflexRatio ) | 0;
		this._channelGap     = isDual ? canvas.height - this._channelHeight * 2 : 0;
		this._analyzerWidth  = canvas.width - centerX * ( this._mirror != 0 );
		this._initialX       = centerX * ( this._mirror == -1 && ! isRadial );
	}

	_calcBars() {
		const bars = this._bars = [];
		if ( ! this._ready ) return;

		const binToFreq = bin => bin * this.audioCtx.sampleRate / this.fftSize || 1;
		const barsPush  = ( posX, binLo, binHi, freqLo, freqHi, ratioLo, ratioHi ) => bars.push( { posX, binLo, binHi, freqLo, freqHi, ratioLo, ratioHi, peak: [0,0], hold: [0], value: [0] } );

		const analyzerWidth = this._analyzerWidth,
			  initialX      = this._initialX,
			  maxFreq       = this._maxFreq,
			  minFreq       = this._minFreq;

		let minLog, logWidth;

		if ( this._isOctaveBands ) {
			let temperedScale = [];
			for ( let octave = 0; octave < 11; octave++ ) {
				for ( let note = 0; note < 24; note++ ) {
					const freq     = C0 * ROOT24 ** ( octave * 24 + note ),
						  bin      = this._freqToBin( freq, 'floor' ),
						  binFreq  = binToFreq( bin ),
						  nextFreq = binToFreq( bin + 1 ),
						  ratio    = ( freq - binFreq ) / ( nextFreq - binFreq );
					temperedScale.push( { freq, bin, ratio } );
				}
			}

			const steps = [0,1,2,3,4,6,8,12,24][ this._mode ];

			for ( let index = 0; index < temperedScale.length; index += steps ) {
				let { freq: freqLo, bin: binLo, ratio: ratioLo } = temperedScale[ index ],
					{ freq: freqHi, bin: binHi, ratio: ratioHi } = temperedScale[ index + steps - 1 ];

				const nBars   = bars.length,
					  prevBar = bars[ nBars - 1 ];

				if ( freqHi > maxFreq || binHi >= this.fftSize / 2 ) {
					prevBar.binHi++;
					prevBar.ratioHi = 0;
					prevBar.freqHi = binToFreq( prevBar.binHi );
					break;
				}

				if ( freqLo >= minFreq ) {
					if ( nBars > 0 ) {
						const diff = binLo - prevBar.binHi;
						if ( diff > 1 ) {
							prevBar.binHi = binLo - ( diff >> 1 );
							prevBar.ratioHi = 0;
							prevBar.freqHi = binToFreq( prevBar.binHi );
							if ( nBars > 1 && prevBar.binHi > prevBar.binLo && prevBar.binLo > bars[ nBars - 2 ].binHi ) {
								prevBar.ratioLo = 0;
								prevBar.freqLo = binToFreq( prevBar.binLo );
							}
							binLo = prevBar.binHi + 1;
						}
						if ( binHi > binLo && binLo > prevBar.binHi ) {
							ratioLo = 0;
							freqLo = binToFreq( binLo );
						}
					}
					barsPush( 0, binLo, binHi, freqLo, freqHi, ratioLo, ratioHi );
				}
			}

			this._barWidth = analyzerWidth / bars.length;
			bars.forEach( ( bar, index ) => bar.posX = initialX + index * this._barWidth );
			minLog = Math.log10( bars[0].freqLo );
			logWidth = analyzerWidth / ( Math.log10( bars[ bars.length - 1 ].freqHi ) - minLog );
		}
		else {
			this._barWidth = 1;
			minLog = Math.log10( minFreq );
			logWidth = analyzerWidth / ( Math.log10( maxFreq ) - minLog );

			const minIndex = this._freqToBin( minFreq, 'floor' ),
				  maxIndex = this._freqToBin( maxFreq );

	 		let lastPos = -999;

			for ( let i = minIndex; i <= maxIndex; i++ ) {
				const freq = binToFreq( i ),
					  pos  = initialX + Math.round( logWidth * ( Math.log10( freq ) - minLog ) );
				if ( pos > lastPos ) {
					barsPush( pos, i, i, freq, freq, 0, 0 );
					lastPos = pos;
				}
				else if ( bars.length ) {
					bars[ bars.length - 1 ].binHi = i;
					bars[ bars.length - 1 ].freqHi = freq;
				}
			}
		}

		this._minLog = minLog;
		this._logWidth = logWidth;
		this._calcAux();
		this._createScales();
		this._calcLeds();
	}

	_calcLeds() {
		if ( ! this._isOctaveBands || ! this._ready ) return;
		const dPR = this._pixelRatio / ( window.devicePixelRatio > 1 && window.screen.height <= 540 ? 2 : 1 );
		const params = [ [],
			[ 128,  3, .45  ], [ 128,  4, .225 ], [  96,  6, .225 ], [  80,  6, .225 ],
			[  80,  6, .125 ], [  64,  6, .125 ], [  48,  8, .125 ], [  24, 16, .125 ],
		];
		const customParams = this._ledParams,
			  [ maxLeds, spaceVRatio, spaceHRatio ] = customParams || params[ this._mode ];
		let ledCount, spaceV, analyzerHeight = this._analyzerHeight;

		if ( customParams ) {
			const minHeight = 2 * dPR;
			let blockHeight;
			ledCount = maxLeds + 1;
			do {
				ledCount--;
				blockHeight = analyzerHeight / ledCount / ( 1 + spaceVRatio );
				spaceV = blockHeight * spaceVRatio;
			} while ( ( blockHeight < minHeight || spaceV < minHeight ) && ledCount > 1 );
		}
		else {
			const refRatio = 540 / spaceVRatio;
			spaceV = Math.min( spaceVRatio * dPR, Math.max( 2, analyzerHeight / refRatio + .1 | 0 ) );
		}

		if ( this._maximizeLeds ) analyzerHeight += spaceV;
		if ( ! customParams ) ledCount = Math.min( maxLeds, analyzerHeight / ( spaceV * 2 ) | 0 );

		this._leds = [
			ledCount,
			spaceHRatio >= 1 ? spaceHRatio : this._barWidth * spaceHRatio,
			spaceV,
			analyzerHeight / ledCount - spaceV
		];
	}

	_createScales() {
		const freqLabels  = [ 16, 31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000 ],
			  canvas      = this._canvasCtx.canvas,
			  scaleX      = this._scaleX,
			  scaleR      = this._scaleR,
			  canvasX     = scaleX.canvas,
			  canvasR     = scaleR.canvas,
			  scaleHeight = Math.min( canvas.width, canvas.height ) * .03 | 0;

		canvasR.width = canvasR.height = ( this._radius << 1 ) + ( this._stereo * scaleHeight );
		const radius  = canvasR.width >> 1,
			  radialY = radius - scaleHeight * .7;

		const radialLabel = ( x, label ) => {
			const angle  = TAU * ( x / canvas.width ),
				  adjAng = angle - HALF_PI,
				  posX   = radialY * Math.cos( adjAng ),
				  posY   = radialY * Math.sin( adjAng );
			scaleR.save();
			scaleR.translate( radius + posX, radius + posY );
			scaleR.rotate( angle );
			scaleR.fillText( label, 0, 0 );
			scaleR.restore();
		}

		canvasX.width |= 0;
		scaleX.fillStyle = scaleR.strokeStyle = '#000c';
		scaleX.fillRect( 0, 0, canvasX.width, canvasX.height );
		scaleR.arc( radius, radius, radius - scaleHeight / 2, 0, TAU );
		scaleR.lineWidth = scaleHeight;
		scaleR.stroke();

		scaleX.fillStyle = scaleR.fillStyle = '#fff';
		scaleX.font = `${ canvasX.height >> 1 }px sans-serif`;
		scaleR.font = `${ scaleHeight >> 1 }px sans-serif`;
		scaleX.textAlign = scaleR.textAlign = 'center';

		for ( const freq of freqLabels ) {
			const label = ( freq >= 1000 ) ? `${ freq / 1000 }k` : freq,
				  x     = this._logWidth * ( Math.log10( freq ) - this._minLog );
			if ( x >= 0 && x <= this._analyzerWidth ) {
				scaleX.fillText( label, this._initialX + x, canvasX.height * .75 );
				if ( x < this._analyzerWidth ) radialLabel( x, label );
				if ( this._mirror ) {
					scaleX.fillText( label, ( this._initialX || canvas.width ) - x, canvasX.height * .75 );
					if ( x > 10 ) radialLabel( -x, label );
				}
			}
		}
	}

	_draw( timestamp ) {
		const ctx            = this._canvasCtx,
			  canvas         = ctx.canvas,
			  canvasX        = this._scaleX.canvas,
			  canvasR        = this._scaleR.canvas,
			  energy         = this._energy,
			  mode           = this._mode,
			  isAlphaBars    = this._isAlphaBars,
			  isLedDisplay   = this._isLedDisplay,
			  isLumiBars     = this._isLumiBars,
			  isOctaveBands  = this._isOctaveBands,
			  isOutline      = this._isOutline,
			  isRadial       = this._radial,
			  isStereo       = this._stereo,
			  lineWidth      = +this.lineWidth,
			  mirrorMode     = this._mirror,
			  channelHeight  = this._channelHeight,
			  channelGap     = this._channelGap,
			  analyzerHeight = this._analyzerHeight,
			  analyzerWidth  = isRadial ? canvas.width : this._analyzerWidth,
			  initialX       = this._initialX,
			  finalX         = initialX + analyzerWidth,
			  centerX        = canvas.width >> 1,
			  centerY        = canvas.height >> 1,
			  radius         = this._radius,
			  maxBarHeight   = isRadial ? Math.min( centerX, centerY ) - radius : analyzerHeight,
			  useCanvas      = this.useCanvas;

		if ( energy.val > 0 ) this._spinAngle += this._spinSpeed * RPM;

		const strokeIf = flag => {
			if ( flag && lineWidth ) {
				const alpha = ctx.globalAlpha;
				ctx.globalAlpha = 1;
				ctx.stroke();
				ctx.globalAlpha = alpha;
			}
		}

		const radialXY = ( x, y, dir ) => {
			const height = radius + y,
				  angle  = dir * TAU * ( x / canvas.width ) + this._spinAngle;
			return [ centerX + height * Math.cos( angle ), centerY + height * Math.sin( angle ) ];
		}

		const radialPoly = ( x, y, w, h, stroke ) => {
			ctx.beginPath();
			for ( const dir of ( mirrorMode ? [1,-1] : [1] ) ) {
				ctx.moveTo( ...radialXY( x, y, dir ) );
				ctx.lineTo( ...radialXY( x, y + h, dir ) );
				ctx.lineTo( ...radialXY( x + w, y + h, dir ) );
				ctx.lineTo( ...radialXY( x + w, y, dir ) );
			}
			strokeIf( stroke );
			ctx.fill();
		}

		const [ ledCount, ledSpaceH, ledSpaceV, ledHeight ] = this._leds || [];
		const ledPosY = height => ( height * ledCount | 0 ) * ( ledHeight + ledSpaceV ) - ledSpaceV;

		const bgColor = ( ! this.showBgColor || isLedDisplay && ! this.overlay ) ? '#000' : this._gradients[ this._gradient ].bgColor;
		let width = this._barWidth - ( ! isOctaveBands ? 0 : Math.max( isLedDisplay ? ledSpaceH : 0, this._barSpacePx ) );
		if ( this._barSpace == 0 && ! isLedDisplay ) width |= 0;

		let currentEnergy = 0;
		const nBars = this._bars.length;

		for ( let channel = 0; channel < isStereo + 1; channel++ ) {
			const channelTop     = channelHeight * channel + channelGap * channel,
				  channelBottom  = channelTop + channelHeight,
				  analyzerBottom = channelTop + analyzerHeight - ( isLedDisplay && ! this._maximizeLeds ? ledSpaceV : 0 );

			if ( useCanvas ) {
				if ( this.overlay ) ctx.clearRect( 0, channelTop - channelGap, canvas.width, channelHeight + channelGap );
				if ( ! this.overlay || this.showBgColor ) {
					if ( this.overlay ) ctx.globalAlpha = this.bgAlpha;
					ctx.fillStyle = bgColor;
					if ( ! isRadial || channel == 0 )
						ctx.fillRect( initialX, channelTop - channelGap, analyzerWidth, ( this.overlay && this.reflexAlpha == 1 ? analyzerHeight : channelHeight ) + channelGap );
					ctx.globalAlpha = 1;
				}

				if ( this.showScaleY && ! isLumiBars && ! isRadial ) {
					const scaleWidth = canvasX.height,
						  fontSize   = scaleWidth >> 1,
						  mindB      = this._analyzer[0].minDecibels,
						  maxdB      = this._analyzer[0].maxDecibels,
						  interval   = analyzerHeight / ( maxdB - mindB );
					ctx.fillStyle = '#888';
					ctx.font = `${fontSize}px sans-serif`;
					ctx.textAlign = 'right';
					ctx.lineWidth = 1;
					for ( let db = maxdB; db > mindB; db -= 5 ) {
						const posY = channelTop + ( maxdB - db ) * interval,
							  even = ( db % 2 == 0 ) | 0;
						if ( even ) {
							const labelY = posY + fontSize * ( posY == channelTop ? .8 : .35 );
							if ( mirrorMode != -1 ) ctx.fillText( db, scaleWidth * .85, labelY );
							if ( mirrorMode != 1 ) ctx.fillText( db, canvas.width - scaleWidth * .1, labelY );
							ctx.strokeStyle = '#888';
							ctx.setLineDash([2,4]);
							ctx.lineDashOffset = 0;
						}
						else {
							ctx.strokeStyle = '#555';
							ctx.setLineDash([2,8]);
							ctx.lineDashOffset = 1;
						}
						ctx.beginPath();
						ctx.moveTo( initialX + scaleWidth * even * ( mirrorMode != -1 ), ~~posY + .5 );
						ctx.lineTo( finalX - scaleWidth * even * ( mirrorMode != 1 ), ~~posY + .5 );
						ctx.stroke();
					}
					ctx.setLineDash([]);
					ctx.lineDashOffset = 0;
				}

				if ( isLedDisplay ) {
					ctx.setLineDash( [ ledHeight, ledSpaceV ] );
					ctx.lineWidth = width;
				}
				else ctx.lineWidth = isOutline ? Math.min( lineWidth, width / 2 ) : lineWidth;
				ctx.fillStyle = ctx.strokeStyle = this._canvasGradient;
			}

			const fftData = this._fftData[ channel ];
			this._analyzer[ channel ].getByteFrequencyData( fftData );
			const interpolate = ( bin, ratio ) => fftData[ bin ] + ( fftData[ bin + 1 ] - fftData[ bin ] ) * ratio;

			ctx.beginPath();
			let points = [];

			for ( let i = 0; i < nBars; i++ ) {
				const bar = this._bars[ i ],
					  { binLo, binHi, ratioLo, ratioHi } = bar;

				let barHeight = Math.max( interpolate( binLo, ratioLo ), interpolate( binHi, ratioHi ) );
				for ( let j = binLo + 1; j < binHi; j++ ) {
					if ( fftData[ j ] > barHeight ) barHeight = fftData[ j ];
				}

				barHeight /= 255;
				bar.value[ channel ] = barHeight;
				currentEnergy += barHeight;

				if ( bar.peak[ channel ] > 0 ) {
					bar.hold[ channel ]--;
					if ( bar.hold[ channel ] < 0 ) bar.peak[ channel ] += bar.hold[ channel ] / maxBarHeight;
				}
				if ( barHeight >= bar.peak[ channel ] ) {
					bar.peak[ channel ] = barHeight;
					bar.hold[ channel ] = 30;
				}

				if ( ! useCanvas ) continue;

				if ( isLumiBars || isAlphaBars ) ctx.globalAlpha = barHeight;
				else if ( isOutline ) ctx.globalAlpha = this.fillAlpha;

				if ( isLedDisplay ) {
					barHeight = ledPosY( barHeight );
					if ( barHeight < 0 ) barHeight = 0;
				}
				else barHeight = barHeight * maxBarHeight | 0;

				if ( isRadial && channel == 1 ) barHeight *= -1;

				let adjWidth = width,
					posX     = bar.posX;

				if ( mode == 10 ) {
					const nextBarAvg = i ? 0 : ( fftData[ this._bars[1].binLo ] / 255 * maxBarHeight * ( ! isRadial || ! channel || - 1 ) + barHeight ) / 2;
					if ( isRadial ) {
						if ( i == 0 ) ctx.lineTo( ...radialXY( 0, ( posX < 0 ? nextBarAvg : barHeight ), 1 ) );
						if ( posX >= 0 ) {
							const point = [ posX, barHeight ];
							ctx.lineTo( ...radialXY( ...point, 1 ) );
							points.push( point );
						}
					}
					else {
						if ( i == 0 ) {
							if ( mirrorMode != -1 ) {
								const prevFFTData = binLo ? fftData[ binLo - 1 ] / 255 * maxBarHeight : barHeight;
								ctx.moveTo( initialX - lineWidth, analyzerBottom - prevFFTData );
							}
							else ctx.moveTo( initialX, analyzerBottom - ( posX < initialX ? nextBarAvg : barHeight ) );
						}
						if ( mirrorMode != -1 || posX >= initialX ) ctx.lineTo( posX, analyzerBottom - barHeight );
					}
				}
				else {
					if ( mode > 0 ) {
						if ( isLedDisplay ) posX += Math.max( ledSpaceH / 2, this._barSpacePx / 2 );
						else {
							if ( this._barSpace == 0 ) {
								posX |= 0;
								if ( i > 0 && posX > this._bars[ i - 1 ].posX + width ) { posX--; adjWidth++; }
							}
							else posX += this._barSpacePx / 2;
						}
					}

					if ( isLedDisplay ) {
						const x = posX + width / 2;
						if ( this.showBgColor && ! this.overlay ) {
							const alpha = ctx.globalAlpha;
							ctx.beginPath();
							ctx.moveTo( x, channelTop );
							ctx.lineTo( x, analyzerBottom );
							ctx.strokeStyle = '#7f7f7f22';
							ctx.globalAlpha = 1;
							ctx.stroke();
							ctx.strokeStyle = ctx.fillStyle;
							ctx.globalAlpha = alpha;
						}
						ctx.beginPath();
						ctx.moveTo( x, isLumiBars ? channelTop : analyzerBottom );
						ctx.lineTo( x, isLumiBars ? channelBottom : analyzerBottom - barHeight );
						ctx.stroke();
					}
					else if ( posX >= initialX ) {
						if ( isRadial ) radialPoly( posX, 0, adjWidth, barHeight, isOutline );
						else {
							const x = posX, y = isLumiBars ? channelTop : analyzerBottom, w = adjWidth, h = isLumiBars ? channelBottom : -barHeight;
							ctx.beginPath();
							ctx.moveTo( x, y );
							ctx.lineTo( x, y + h );
							ctx.lineTo( x + w, y + h );
							ctx.lineTo( x + w, y );
							strokeIf( isOutline );
							ctx.fill();
						}
					}
				}

				const peak = bar.peak[ channel ];
				if ( peak > 0 && this.showPeaks && ! isLumiBars && posX >= initialX && posX < finalX ) {
					if ( isOutline && lineWidth > 0 ) ctx.globalAlpha = 1;
					else if ( isAlphaBars ) ctx.globalAlpha = peak;
					if ( isLedDisplay ) ctx.fillRect( posX, analyzerBottom - ledPosY( peak ), width, ledHeight );
					else if ( ! isRadial ) ctx.fillRect( posX, analyzerBottom - peak * maxBarHeight, adjWidth, 2 );
					else if ( mode != 10 ) radialPoly( posX, peak * maxBarHeight * ( ! channel || -1 ), adjWidth, -2 );
				}
			}

			if ( ! useCanvas ) continue;
			ctx.globalAlpha = 1;

			if ( mode == 10 ) {
				if ( isRadial ) {
					if ( mirrorMode ) {
						let p;
						while ( p = points.pop() ) ctx.lineTo( ...radialXY( ...p, -1 ) );
					}
					ctx.closePath();
				}
				if ( lineWidth > 0 ) ctx.stroke();
				if ( this.fillAlpha > 0 ) {
					if ( isRadial ) {
						ctx.moveTo( centerX + radius, centerY );
						ctx.arc( centerX, centerY, radius, 0, TAU, true );
					}
					else {
						ctx.lineTo( finalX, analyzerBottom );
						ctx.lineTo( initialX, analyzerBottom );
					}
					ctx.globalAlpha = this.fillAlpha;
					ctx.fill();
					ctx.globalAlpha = 1;
				}
			}

			if ( this._reflexRatio > 0 && ! isLumiBars ) {
				let posY, height;
				if ( this.reflexFit || isStereo ) {
					posY   = isStereo && channel == 0 ? channelHeight + channelGap : 0;
					height = channelHeight - analyzerHeight;
				}
				else {
					posY   = canvas.height - analyzerHeight * 2;
					height = analyzerHeight;
				}
				ctx.globalAlpha = this.reflexAlpha;
				if ( this.reflexBright != 1 ) ctx.filter = `brightness(${this.reflexBright})`;
				ctx.setTransform( 1, 0, 0, -1, 0, canvas.height );
				ctx.drawImage( canvas, 0, channelTop, canvas.width, analyzerHeight, 0, posY, canvas.width, height );
				ctx.setTransform( 1, 0, 0, 1, 0, 0 );
				ctx.filter = 'none';
				ctx.globalAlpha = 1;
			}
		}

		energy.val = currentEnergy / ( nBars << isStereo );
		if ( energy.val >= energy.peak ) { energy.peak = energy.val; energy.hold = 30; }
		else {
			if ( energy.hold > 0 ) energy.hold--;
			else if ( energy.peak > 0 ) energy.peak *= ( 30 + energy.hold-- ) / 30;
		}

		if ( useCanvas ) {
			if ( mirrorMode && ! isRadial ) {
				ctx.setTransform( -1, 0, 0, 1, canvas.width - initialX, 0 );
				ctx.drawImage( canvas, initialX, 0, centerX, canvas.height, 0, 0, centerX, canvas.height );
				ctx.setTransform( 1, 0, 0, 1, 0, 0 );
			}
			ctx.setLineDash([]);
			if ( this.showScaleX ) {
				if ( isRadial ) {
					ctx.save();
					ctx.translate( centerX, centerY );
					if ( this._spinSpeed ) ctx.rotate( this._spinAngle + HALF_PI );
					ctx.drawImage( canvasR, -canvasR.width >> 1, -canvasR.width >> 1 );
					ctx.restore();
				}
				else ctx.drawImage( canvasX, 0, canvas.height - canvasX.height );
			}
		}

		this._frame++;
		const elapsed = timestamp - this._time;
		if ( elapsed >= 1000 ) {
			this._fps = this._frame / ( elapsed / 1000 );
			this._frame = 0;
			this._time = timestamp;
		}
		if ( this.showFPS ) {
			const size = canvasX.height;
			ctx.font = `bold ${size}px sans-serif`;
			ctx.fillStyle = '#0f0';
			ctx.textAlign = 'right';
			ctx.fillText( Math.round( this._fps ), canvas.width - size, size * 2 );
		}

		if ( this.onCanvasDraw ) {
			ctx.save();
			ctx.fillStyle = ctx.strokeStyle = this._canvasGradient;
			this.onCanvasDraw( this );
			ctx.restore();
		}

		this._runId = requestAnimationFrame( timestamp => this._draw( timestamp ) );
	}

	_freqToBin( freq, rounding = 'round' ) {
		const max = this._analyzer[0].frequencyBinCount - 1,
			  bin = Math[ rounding ]( freq * this.fftSize / this.audioCtx.sampleRate );
		return bin < max ? bin : max;
	}

	_makeGrad() {
		if ( ! this._ready ) return;

		const ctx            = this._canvasCtx,
			  canvas         = ctx.canvas,
			  isLumiBars     = this._isLumiBars,
			  gradientHeight = isLumiBars ? canvas.height : canvas.height * ( 1 - this._reflexRatio * ! this._stereo ) | 0,
			  analyzerRatio  = 1 - this._reflexRatio,
			  initialX       = this._initialX;

		const centerX   = canvas.width >> 1,
			  centerY   = canvas.height >> 1,
			  maxRadius = Math.min( centerX, centerY ),
			  radius    = this._radius;

		const currGradient = this._gradients[ this._gradient ],
			  colorStops   = currGradient.colorStops,
			  isHorizontal = currGradient.dir == 'h';

		let grad;

		if ( this._radial )
			grad = ctx.createRadialGradient( centerX, centerY, maxRadius, centerX, centerY, radius - ( maxRadius - radius ) * this._stereo );
		else
			grad = ctx.createLinearGradient( ...( isHorizontal ? [ initialX, 0, initialX + this._analyzerWidth, 0 ] : [ 0, 0, 0, gradientHeight ] ) );

		if ( colorStops ) {
			const dual = this._stereo && ! this._splitGradient && ! isHorizontal;
			const addColorStop = ( offset, colorInfo ) => grad.addColorStop( offset, colorInfo.color || colorInfo );

			for ( let channel = 0; channel < 1 + dual; channel++ ) {
				colorStops.forEach( ( colorInfo, index ) => {
					const maxIndex = colorStops.length - 1;
					let offset = colorInfo.pos !== undefined ? colorInfo.pos : index / maxIndex;

					if ( dual ) offset /= 2;
					if ( this._stereo && ! isLumiBars && ! this._radial && ! isHorizontal ) {
						offset *= analyzerRatio;
						if ( ! dual && offset > .5 * analyzerRatio ) offset += .5 * this._reflexRatio;
					}

					if ( channel == 1 ) {
						if ( this._radial || isLumiBars ) {
							const revIndex = maxIndex - index;
							colorInfo = colorStops[ revIndex ];
							offset = 1 - ( colorInfo.pos !== undefined ? colorInfo.pos : revIndex / maxIndex ) / 2;
						}
						else {
							if ( index == 0 && offset > 0 ) addColorStop( .5, colorInfo );
							offset += .5;
						}
					}

					addColorStop( offset, colorInfo );
					if ( this._stereo && index == maxIndex && offset < .5 ) addColorStop( .5, colorInfo );
				});
			}
		}

		this._canvasGradient = grad;
	}

	_setCanvas( reason ) {
		if ( ! this._ready ) return;

		const ctx        = this._canvasCtx,
			  canvas     = ctx.canvas,
			  canvasX    = this._scaleX.canvas,
			  pixelRatio = window.devicePixelRatio / ( this._loRes + 1 );

		let screenWidth  = window.screen.width  * pixelRatio,
			screenHeight = window.screen.height * pixelRatio;

		if ( Math.abs( window.orientation ) == 90 && screenWidth < screenHeight )
			[ screenWidth, screenHeight ] = [ screenHeight, screenWidth ];

		const isFullscreen = this.isFullscreen,
			  isCanvasFs   = isFullscreen && this._fsEl == canvas,
			  newWidth     = isCanvasFs ? screenWidth  : ( this._width  || this._container.clientWidth  || this._defaultWidth  ) * pixelRatio | 0,
			  newHeight    = isCanvasFs ? screenHeight : ( this._height || this._container.clientHeight || this._defaultHeight ) * pixelRatio | 0;

		this._pixelRatio = pixelRatio;
		this._fsWidth    = screenWidth;
		this._fsHeight   = screenHeight;

		if ( canvas.width == newWidth && canvas.height == newHeight ) return;

		canvas.width  = newWidth;
		canvas.height = newHeight;
		this._calcAux();

		if ( ! this.overlay ) {
			ctx.fillStyle = '#000';
			ctx.fillRect( 0, 0, newWidth, newHeight );
		}

		ctx.lineJoin = 'bevel';
		canvasX.width = newWidth;
		canvasX.height = Math.max( 20 * pixelRatio, Math.min( newWidth, newHeight ) / 27 | 0 );

		this._makeGrad();
		this._calcBars();

		if ( this._fsStatus !== undefined && this._fsStatus !== isFullscreen ) reason = 'fschange';
		this._fsStatus = isFullscreen;

		if ( this.onCanvasResize ) this.onCanvasResize( reason, this );
	}

	_setProps( options, useDefaults ) {
		const defaults = {
			alphaBars    : false,
			barSpace     : 0.1,
			bgAlpha      : 0.7,
			fftSize      : 8192,
			fillAlpha    : 1,
			gradient     : 'classic',
			ledBars      : false,
			lineWidth    : 0,
			loRes        : false,
			lumiBars     : false,
			maxDecibels  : -25,
			maxFreq      : 22000,
			minDecibels  : -85,
			minFreq      : 20,
			mirror       : 0,
			mode         : 0,
			outlineBars  : false,
			overlay      : false,
			radial		 : false,
			reflexAlpha  : 0.15,
			reflexBright : 1,
			reflexFit    : true,
			reflexRatio  : 0,
			showBgColor  : true,
			showFPS      : false,
			showPeaks    : true,
			showScaleX   : true,
			showScaleY   : false,
			smoothing    : 0.5,
			spinSpeed    : 0,
			splitGradient: false,
			start        : true,
			stereo       : false,
			useCanvas    : true,
			volume       : 1,
		};

		const callbacks = [ 'onCanvasDraw', 'onCanvasResize' ];
		const validProps = Object.keys( defaults ).filter( e => e != 'start' ).concat( callbacks, ['height', 'width'] );

		if ( options && options.showLeds !== undefined && options.ledBars === undefined )
			options.ledBars = options.showLeds;

		if ( useDefaults || options === undefined )
			options = { ...defaults, ...options };

		for ( const prop of Object.keys( options ) ) {
			if ( callbacks.includes( prop ) && typeof options[ prop ] !== 'function' )
				this[ prop ] = undefined;
			else if ( validProps.includes( prop ) )
				this[ prop ] = options[ prop ];
		}

		if ( options.start !== undefined )
			this.toggleAnalyzer( options.start );
	}
}

class AudioMotionError extends Error {
	constructor( code, message ) {
		super( message );
		this.name = 'AudioMotionError';
		this.code = code;
	}
}
