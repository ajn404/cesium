/*global define*/
define([
        '../Core/Color',
        '../Core/defined',
        '../Core/defineProperties',
        '../Core/destroyObject',
        '../Core/PixelFormat',
        '../Renderer/ClearCommand',
        '../Renderer/PixelDatatype',
        '../Shaders/PostProcessFilters/PassThrough'
    ], function(
        Color,
        defined,
        defineProperties,
        destroyObject,
        PixelFormat,
        ClearCommand,
        PixelDatatype,
        PassThrough) {
    "use strict";
    /*global WebGLRenderingContext*/

    /**
     * @private
     */
    var GlobeDepth = function(context) {
        this._colorTexture = undefined;
        this._depthStencilTexture = undefined;
        this._globeDepthTexture = undefined;

        this.framebuffer = undefined;
        this._copyDepthFramebuffer = undefined;

        this._clearColorCommand = undefined;
        this._copyColorCommand = undefined;
        this._copyDepthCommand = undefined;

        var supported = updateFramebuffers(this, context);
        if (supported) {
            updateCopyCommands(this, context);
        }

        this._supported = supported;

        this._debugGlobeDepthTextures = [];
        this._debugGlobeDepthFramebuffers = [];
        this._debugGlobeDepthCommands = [];
        this._debugGlobeDepthTexture = undefined;
        this._debugGlobeDepthViewportCommand = undefined;
    };

    defineProperties(GlobeDepth.prototype, {
        supported : {
            get : function() {
                return this._supported;
            }
        }
    });

    function destroyDebugGlobeDepthTexture(globeDepth, textureIndex) {
        var texture = globeDepth._debugGlobeDepthTextures[textureIndex];
        texture = texture && !texture.isDestroyed() && texture.destroy();
    }

    function destroyDebugGlobeDepthFramebuffer(globeDepth, textureIndex) {
        var framebuffer = globeDepth._debugGlobeDepthFramebuffers[textureIndex];
        framebuffer = framebuffer && !framebuffer.isDestroyed() && framebuffer.destroy();
    }

    function destroyDebugGlobeDepthCommand(globeDepth, textureIndex) {
        var command = globeDepth._debugGlobeDepthCommands[textureIndex];
        if (defined(command)) {
            command.shaderProgram = command.shaderProgram && command.shaderProgram.destroy();
        }
    }

    function destroyGlobeDepthObjects(globeDepth) {
        for (var i = 0; i < globeDepth._debugGlobeDepthTextures.length; ++i) {
            destroyDebugGlobeDepthTexture(globeDepth, i);
        }
        globeDepth._debugGlobeDepthTextures.length = 0;
        for (var j = 0; j < globeDepth._debugGlobeDepthFramebuffers.length; ++j) {
            destroyDebugGlobeDepthFramebuffer(globeDepth, j);
        }
        globeDepth._debugGlobeDepthFramebuffers.length = 0;
        for (var k = 0; k < globeDepth._debugGlobeDepthCommands.length; ++k) {
            destroyDebugGlobeDepthCommand(globeDepth, k);
        }
        globeDepth._debugGlobeDepthCommands.length = 0;
    }

    function updateDebugGlobeDepth(globeDepth, context, uniformState, index) {
        var texture = globeDepth._debugGlobeDepthTextures[index];
        var framebuffer = globeDepth._debugGlobeDepthFramebuffers[index];
        var command = globeDepth._debugGlobeDepthCommands[index];

        var width = context.drawingBufferWidth;
        var height = context.drawingBufferHeight;

        var textureChanged = !defined(texture) || texture.width !== width || texture.height !== height;
        if (textureChanged) {
            destroyDebugGlobeDepthTexture(globeDepth, index);
            destroyDebugGlobeDepthFramebuffer(globeDepth, index);
            destroyDebugGlobeDepthCommand(globeDepth, index);

            texture = context.createTexture2D({
                width : width,
                height : height,
                pixelFormat : PixelFormat.RGBA,
                pixelDatatype : PixelDatatype.FLOAT
            });

            globeDepth._debugGlobeDepthTextures[index] = texture;

            framebuffer = context.createFramebuffer({
                colorTextures : [texture],
                destroyAttachments : false
            });

            globeDepth._debugGlobeDepthFramebuffers[index] = framebuffer;

            command = context.createViewportQuadCommand(PassThrough, {
                renderState : context.createRenderState(),
                uniformMap : {
                    u_texture : function() {
                        return uniformState.globeDepthTexture;
                    }
                },
                owner : globeDepth
            });

            globeDepth._debugGlobeDepthCommands[index] = command;
        }
    }

    function executeDebugGlobeDepth(globeDepth, context, passState, index) {
        globeDepth._debugGlobeDepthTexture = globeDepth._debugGlobeDepthTextures[index];

        if (!defined(globeDepth._debugGlobeDepthViewportCommand)) {
            var fs =
                'uniform sampler2D u_texture;\n' +
                'varying vec2 v_textureCoordinates;\n' +
                'void main()\n' +
                '{\n' +
                '    float z_window = texture2D(u_texture, v_textureCoordinates).r;\n' +
                '    float n_range = czm_depthRange.near;\n' +
                '    float f_range = czm_depthRange.far;\n' +
                '    float z_ndc = (2.0 * z_window - n_range - f_range) / (f_range - n_range);\n' +
                '    gl_FragColor = vec4(mix(vec3(0.0), vec3(1.0), z_ndc * 0.5 + 0.5), 1.0);\n' +
                '}\n';

            globeDepth._debugGlobeDepthViewportCommand = context.createViewportQuadCommand(fs, {
                uniformMap : {
                    u_texture : function() {
                        return globeDepth._debugGlobeDepthTexture;
                    }
                },
                owner : globeDepth
            });
        }

        globeDepth._debugGlobeDepthViewportCommand.execute(context, passState);
    }

    function destroyTextures(globeDepth) {
        globeDepth._colorTexture = globeDepth._colorTexture && !globeDepth._colorTexture.isDestroyed() && globeDepth._colorTexture.destroy();
        globeDepth._depthStencilTexture = globeDepth._depthStencilTexture && !globeDepth._depthStencilTexture.isDestroyed() && globeDepth._depthStencilTexture.destroy();
        globeDepth._globeDepthTexture = globeDepth._globeDepthTexture && !globeDepth._globeDepthTexture.isDestroyed() && globeDepth._globeDepthTexture.destroy();
    }

    function destroyFramebuffers(globeDepth) {
        globeDepth.framebuffer = globeDepth.framebuffer && !globeDepth.framebuffer.isDestroyed() && globeDepth.framebuffer.destroy();
        globeDepth._copyDepthFramebuffer = globeDepth._copyDepthFramebuffer && !globeDepth._copyDepthFramebuffer.isDestroyed() && globeDepth._copyDepthFramebuffer.destroy();
    }

    function createTextures(globeDepth, context, width, height) {
        globeDepth._colorTexture = context.createTexture2D({
            width : width,
            height : height,
            pixelFormat : PixelFormat.RGBA,
            pixelDatatype : PixelDatatype.UNSIGNED_BYTE
        });

        globeDepth._depthStencilTexture = context.createTexture2D({
            width : width,
            height : height,
            pixelFormat : PixelFormat.DEPTH_STENCIL,
            pixelDatatype : PixelDatatype.UNSIGNED_INT_24_8_WEBGL
        });

        globeDepth._globeDepthTexture = context.createTexture2D({
            width : width,
            height : height,
            pixelFormat : PixelFormat.RGBA,
            pixelDatatype : PixelDatatype.FLOAT
        });
    }

    function createFramebuffers(globeDepth, context, width, height) {
        destroyTextures(globeDepth);
        destroyFramebuffers(globeDepth);

        createTextures(globeDepth, context, width, height);

        globeDepth.framebuffer = context.createFramebuffer({
            colorTextures : [globeDepth._colorTexture],
            depthStencilTexture : globeDepth._depthStencilTexture,
            destroyAttachments : false
        });

        globeDepth._copyDepthFramebuffer = context.createFramebuffer({
            colorTextures : [globeDepth._globeDepthTexture],
            destroyAttachments : false
        });

        var complete = WebGLRenderingContext.FRAMEBUFFER_COMPLETE;
        if (globeDepth.framebuffer.status !== complete || globeDepth._copyDepthFramebuffer.status !== complete) {
            destroyTextures(globeDepth);
            destroyFramebuffers(globeDepth);
            return false;
        }

        return true;
    }

    function updateFramebuffers(globeDepth, context) {
        if (!context.depthTexture) {
            return;
        }

        var width = context.drawingBufferWidth;
        var height = context.drawingBufferHeight;

        var colorTexture = globeDepth._colorTexture;
        var textureChanged = !defined(colorTexture) || colorTexture.width !== width || colorTexture.height !== height;
        if (!defined(globeDepth.framebuffer) || textureChanged) {
            if (!createFramebuffers(globeDepth, context, width, height)) {
                // framebuffer creation failed
                return false;
            }
        }

        context.uniformState.globeDepthTexture = globeDepth._globeDepthTexture;

        return true;
    }

    function updateCopyCommands(globeDepth, context) {
        if (!defined(globeDepth._copyDepthCommand)) {
            globeDepth._copyDepthCommand = context.createViewportQuadCommand(PassThrough, {
                renderState : context.createRenderState(),
                uniformMap : {
                    u_texture : function() {
                        return globeDepth._depthStencilTexture;
                    }
                },
                owner : globeDepth
            });
        }

        globeDepth._copyDepthCommand.framebuffer = globeDepth._copyDepthFramebuffer;

        if (!defined(globeDepth._copyColorCommand)) {
            globeDepth._copyColorCommand = context.createViewportQuadCommand(PassThrough, {
                renderState : context.createRenderState(),
                uniformMap : {
                    u_texture : function() {
                        return globeDepth._colorTexture;
                    }
                },
                owner : globeDepth
            });
        }

        if (!defined(globeDepth._clearColorCommand)) {
            globeDepth._clearColorCommand = new ClearCommand({
                color : new Color(0.0, 0.0, 0.0, 0.0),
                owner : globeDepth
            });
        }

        globeDepth._clearColorCommand.framebuffer = globeDepth.framebuffer;
    }

    GlobeDepth.prototype.updateDebugGlobeDepth = function(context, uniformState, index) {
        if (!this.supported) {
            return;
        }

        updateDebugGlobeDepth(this, context, uniformState, index);
    };

    GlobeDepth.prototype.executeDebugGlobeDepth = function(context, passState, index) {
        if (!this.supported) {
            return;
        }

        executeDebugGlobeDepth(this, context, passState, index);
    };

    GlobeDepth.prototype.update = function(context) {
        if (!this.supported) {
            return;
        }

        updateFramebuffers(this, context);
        updateCopyCommands(this, context);
    };

    GlobeDepth.prototype.executeCopyDepth = function(context, passState) {
        if (this.supported && defined(this._copyDepthCommand)) {
            this._copyDepthCommand.execute(context, passState);
        }
    };

    GlobeDepth.prototype.executeCopyColor = function(context, passState) {
        if (this.supported && defined(this._copyColorCommand)) {
            this._copyColorCommand.execute(context, passState);
        }
    };

    GlobeDepth.prototype.clear = function(context, passState, clearColor) {
        if (this.supported) {
            var clear = this._clearColorCommand;
            Color.clone(clearColor, clear.color);
            clear.execute(context, passState);
        }
    };

    GlobeDepth.prototype.isDestroyed = function() {
        return false;
    };

    GlobeDepth.prototype.destroy = function() {
        destroyTextures(this);
        destroyFramebuffers(this);

        this._copyColorCommand.shaderProgram = defined(this._copyColorCommand.shaderProgram) && this._copyColorCommand.shaderProgram.destroy();
        this._copyDepthCommand.shaderProgram = defined(this._copyDepthCommand.shaderProgram) && this._copyDepthCommand.shaderProgram.destroy();

        destroyGlobeDepthObjects(this);

        return destroyObject(this);
    };

    return GlobeDepth;
});