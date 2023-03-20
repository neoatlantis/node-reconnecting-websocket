// MIT License:
//
// Copyright (c) 2010-2012, Joe Walnes
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/**
 * This behaves like a WebSocket in every way, except if it fails to connect,
 * or it gets disconnected, it will repeatedly poll until it successfully connects
 * again.
 *
 * It is API compatible, so when you have:
 *   ws = new WebSocket('ws://....');
 * you can replace with:
 *   ws = new ReconnectingWebSocket('ws://....');
 *
 * The event stream will typically look like:
 *  onconnecting
 *  onopen
 *  onmessage
 *  onmessage
 *  onclose // lost connection
 *  onconnecting
 *  onopen  // sometime later...
 *  onmessage
 *  onmessage
 *  etc...
 *
 * It is API compatible with the standard WebSocket API, apart from the following members:
 *
 * - `bufferedAmount`
 * - `extensions`
 * - `binaryType`
 *
 * Latest version: https://github.com/joewalnes/reconnecting-websocket/
 * - Joe Walnes
 *
 * Syntax
 * ======
 * var socket = new ReconnectingWebSocket(url, protocols, options);
 *
 * Parameters
 * ==========
 * url - The url you are connecting to.
 * protocols - Optional string or array of protocols.
 * options - See below
 *
 * Options
 * =======
 * Options can either be passed upon instantiation or set after instantiation:
 *
 * var socket = new ReconnectingWebSocket(url, null, { debug: true, reconnectInterval: 4000 });
 *
 * or
 *
 * var socket = new ReconnectingWebSocket(url);
 * socket.debug = true;
 * socket.reconnectInterval = 4000;
 *
 * debug
 * - Whether this instance should log debug messages. Accepts true or false. Default: false.
 *
 * automaticOpen
 * - Whether or not the websocket should attempt to connect immediately upon instantiation. The socket can be manually opened or closed at any time using ws.open() and ws.close().
 *
 * reconnectInterval
 * - The number of milliseconds to delay before attempting to reconnect. Accepts integer. Default: 1000.
 *
 * maxReconnectInterval
 * - The maximum number of milliseconds to delay a reconnection attempt. Accepts integer. Default: 30000.
 *
 * reconnectDecay
 * - The rate of increase of the reconnect delay. Allows reconnect attempts to back off when problems persist. Accepts integer or float. Default: 1.5.
 *
 * timeoutInterval
 * - The maximum time in milliseconds to wait for a connection to succeed before closing and retrying. Accepts integer. Default: 2000.
 *
 */


const DefaultWebSocket = require("ws");
const _decorate_ws = require("./_decorate_ws");
const hidden_attr = require("./_symbols");



class ReconnectingWebSocket extends EventTarget{

    #ws;
    #timedOut = false;

    
    get url(){ return hidden_attr(this, "url") }
    get reconnectAttempts(){ return hidden_attr(this, "reconnectAttempts") }
    get readyState(){ return hidden_attr(this, "readyState") }

    constructor(url, protocols, options) {

        super();

        // Default settings
        var settings = {

            ws: DefaultWebSocket,

            /** Whether this instance should log debug messages. */
            debug: false,

            /** Whether or not the websocket should attempt to connect immediately upon instantiation. */
            automaticOpen: true,

            /** The number of milliseconds to delay before attempting to reconnect. */
            reconnectInterval: 1000,
            /** The maximum number of milliseconds to delay a reconnection attempt. */
            maxReconnectInterval: 30000,
            /** The rate of increase of the reconnect delay. Allows reconnect attempts to back off when problems persist. */
            reconnectDecay: 1.5,

            /** The maximum time in milliseconds to wait for a connection to succeed before closing and retrying. */
            timeoutInterval: 2000,

            /** The maximum number of reconnection attempts to make. Unlimited if null. */
            maxReconnectAttempts: null,

            /** The binary type, possible values 'blob' or 'arraybuffer', default 'arraybuffer'. */
            binaryType: 'arraybuffer'
        }
        if (!options) { options = {}; }

        // Overwrite and define settings with options if they exist.
        for (let key in settings) {
            hidden_attr(
                this,
                key,
                options[key] !== undefined ? options[key] : settings[key]
            );
        }

        /** The URL as resolved by the constructor. This is always an absolute URL. */
        hidden_attr(this, "url", url);

        /** The number of attempted reconnects since starting, or the last successful connection.*/
        hidden_attr(this, "reconnectAttempts", 0);

        hidden_attr(this, "readyState", hidden_attr(this, "ws").CONNECTING);

        /**
         * A string indicating the name of the sub-protocol the server selected; this will be one of
         * the strings specified in the protocols parameter when creating the WebSocket object.
         * Read only.
         */
        hidden_attr(this, "protocol", null);

        this.addEventListener('open',       (e)=>this.onopen(e));
        this.addEventListener('close',      (e)=>this.onclose(e));
        this.addEventListener('connecting', (e)=>this.onconnecting(e));
        this.addEventListener('message',    (e)=>this.onmessage(e));
        this.addEventListener('error',      (e)=>this.onerror(e));

        // some methods in handy
        this.on = (a,b,c)=>this.addEventListener(a,b,c);
        this.off = (a,b,c)=>this.removeEventListener(a,b,c);


        // Whether or not to create a websocket upon instantiation
        if (hidden_attr(this, "automaticOpen") == true){
            this.open(false);
        }
    }

    open(reconnectAttempt) {
        const WebSocket = hidden_attr(this, "ws");
        const url = hidden_attr(this, "url");
        const protocols = hidden_attr(this, "protocols");

        this.#ws = new WebSocket(url, protocols || []);
        this.#ws.binaryType = hidden_attr(this, "binaryType");

        if (hidden_attr(this, reconnectAttempt)){
            if(
                hidden_attr(this, "maxReconnectAttempts") &&
                hidden_attr(this, "reconnectAttempts") >
                    hidden_attr(this, "maxReconnectAttempts")
            ){
                return;
            }
        } else {
            this.dispatchEvent(new Event('connecting'));
            hidden_attr(this, "reconnectAttempts", 0);
        }

        /*if (self.debug || ReconnectingWebSocket.debugAll) {
            console.debug('ReconnectingWebSocket', 'attempt-connect', this.url);
        }*/

        _decorate_ws.call(this, this.#ws, { reconnectAttempt });
    }

        

    /**
     * Transmits data to the server over the WebSocket connection.
     *
     * @param data a text string, ArrayBuffer or Blob to send to the server.
     */
    send(data) {
        if (ws) {
            if (self.debug || ReconnectingWebSocket.debugAll) {
                console.debug('ReconnectingWebSocket', 'send', self.url, data);
            }
            return ws.send(data);
        } else {
            throw 'INVALID_STATE_ERR : Pausing to reconnect websocket';
        }
    }

    /**
     * Closes the WebSocket connection or connection attempt, if any.
     * If the connection is already CLOSED, this method does nothing.
     */
    close(code, reason) {
        // Default CLOSE_NORMAL code
        if (typeof code == 'undefined') {
            code = 1000;
        }
        hidden_attr(this, "forcedClose", true);
        if (this.#ws) {
            this.#ws.close(code, reason);
        }
    }

    /**
     * Additional public API method to refresh the connection if still open (close, re-open).
     * For example, if the app suspects bad data / missed heart beats, it can try to refresh.
     */
    refresh() {
        if (this.#ws) {
            this.#ws.close();
        }
    }


    /**
     * An event listener to be called when the WebSocket connection's readyState changes to OPEN;
     * this indicates that the connection is ready to send and receive data.
     */
    onopen(event){}
    /** An event listener to be called when the WebSocket connection's readyState changes to CLOSED. */
    onclose(event){}
    /** An event listener to be called when a connection begins being attempted. */
    onconnecting(event){}
    /** An event listener to be called when a message is received from the server. */
    onmessage(event){}
    /** An event listener to be called when an error occurs. */
    onerror(event){}

    /**
     * Whether all instances of ReconnectingWebSocket should log debug messages.
     * Setting this to true is the equivalent of setting all instances of ReconnectingWebSocket.debug to true.
     */
    debugAll = false;

    CONNECTING = DefaultWebSocket.CONNECTING;
    OPEN = DefaultWebSocket.OPEN;
    CLOSING = DefaultWebSocket.CLOSING;
    CLOSED = DefaultWebSocket.CLOSED;
}

module.exports = ReconnectingWebSocket;
