const DefaultWebSocket = require("ws");
const hidden_attr = require("./_symbols");


function do_heartbeat(ws){
    console.log("Setting up heartbeat mechanism.");

    const pingTimeout = hidden_attr(this, "pingTimeout");
    const pingFrequency = hidden_attr(this, "pingFrequency");

    hidden_attr(this, "pingLast", 0);
    hidden_attr(this, "pongLast", 0);
    hidden_attr(this, "pingTimedOut", false);

    let on_timeout = ()=>{
        console.log("ReconnectingWebsocket: server no response...");
        hidden_attr(this, "pingTimedOut", true);
        this.refresh();
    }

    let recv_heartbeat = ()=>{
        hidden_attr(this, "pongLast", new Date().getTime());
        console.log("ReconnectingWebsocket: got pong!");
    }
    ws.on("pong", recv_heartbeat);

    const pinging = setInterval(()=>{
        let pingLast = hidden_attr(this, "pingLast"),
            pongLast = hidden_attr(this, "pongLast");
        if(pingLast - pongLast > pingTimeout){
            console.log('pinglast', pingLast, 'pongLast', pongLast, 'timedout');
            on_timeout();
        }

        if(
            !ws ||
            hidden_attr(this, "pingTimedOut")
        ){
            undo_heartbeat();
            return;
        }
        hidden_attr(this, "pingLast", new Date().getTime());
        if(pongLast < 1){
            hidden_attr(this, "pongLast", new Date().getTime());
        }

        ws.ping();
        console.log("ReconnectingWebsocket: send ping!");
    }, pingTimeout / pingFrequency);
    hidden_attr(this, "pingInterval", pinging);

}

function undo_heartbeat(){
    console.log("undo heartbeat");
    let pinging = hidden_attr(this, "pingInterval");
    clearInterval(pinging);
    hidden_attr.unset(this, "pingInterval");
}




module.exports = function({ reconnectAttempt }){
    const self = this;

    const WebSocket = hidden_attr(this, "ws");
    const url = hidden_attr(this, "url");
    const protocols = hidden_attr(this, "protocols");

    let ws = new WebSocket(url, protocols || []);
    ws.binaryType = hidden_attr(this, "binaryType");

    hidden_attr(this, "wsInstance", ws);


    let timeout = setTimeout(function() {
        /*if (self.debug || ReconnectingWebSocket.debugAll) {*/
        console.debug('ReconnectingWebSocket', 'connection-timeout', hidden_attr(this, "url"));
        /*}*/
        hidden_attr(this, "timedOut", true);
        ws.close();
        hidden_attr(this, "timedOut", false);
    }, hidden_attr(this, "timeoutInterval"));

    ws.onopen = (event)=>{
        clearTimeout(timeout);
        /*if (self.debug || ReconnectingWebSocket.debugAll) {
            console.debug('ReconnectingWebSocket', 'onopen', self.url);
        }*/
        hidden_attr(this, "protocol", ws.protocol);
        hidden_attr(this, "readyState", DefaultWebSocket.OPEN);
        hidden_attr(this, "reconnectAttempts", 0);

        let e = new Event('open');
        e.isReconnect = reconnectAttempt;
        reconnectAttempt = false;
        
        this.dispatchEvent(e);
    };

    ws.onclose = (event)=>{
        clearTimeout(timeout);
        ws = null;
        hidden_attr(this, "wsInstance", null);
        //undo_heartbeat();

        if (hidden_attr(this, "forcedClose")){
            hidden_attr(this, "readyState", DefaultWebSocket.CLOSED);
            this.dispatchEvent(new Event('close'));
            return;
        }

        hidden_attr(this, "readyState", DefaultWebSocket.CONNECTING);
        var e = new Event('connecting');
        e.code = event.code;
        e.reason = event.reason;
        e.wasClean = event.wasClean;
        this.dispatchEvent(e);

        if(
            !hidden_attr(this, "reconnectAttempt") &&
            !hidden_attr(this, "timedOut")
        ){
            /*if (self.debug || ReconnectingWebSocket.debugAll) {
                console.debug('ReconnectingWebSocket', 'onclose', self.url);
            }*/
            this.dispatchEvent(new Event('close'));
        }

        let waittime = hidden_attr(this, "reconnectInterval") * Math.pow(
            hidden_attr(this, "reconnectDecay"),
            hidden_attr(this, "reconnectAttempts")
        );
        setTimeout(()=>{
            hidden_attr(
                this,
                "reconnectAttempts",
                hidden_attr(this, "reconnectAttempts") + 1
            );
            this.open(true);
        }, (
            waittime > hidden_attr(this, "maxReconnectInterval") ? 
            hidden_attr(this, "maxReconnectInterval")            :
            waittime
        ));
    };

    ws.onmessage = (event)=>{
        /*if (self.debug || ReconnectingWebSocket.debugAll) {
            console.debug('ReconnectingWebSocket', 'onmessage', self.url, event.data);
        }*/
        let e = new Event('message');
        e.data = event.data;
        this.dispatchEvent(e);
    };

    ws.onerror = (event)=>{
        /*if (self.debug || ReconnectingWebSocket.debugAll) {
            console.debug('ReconnectingWebSocket', 'onerror', self.url, event);
        }*/
        this.dispatchEvent(new Event('error'));
    };

    // if ws has .ping() defined(as in `ws` library), use that
    if(ws.ping !== undefined){
        //do_heartbeat.call(this, ws);
    }

}