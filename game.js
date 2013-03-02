function Director() {
    this.events = [];
    this.running = false;
};

Director.prototype.addNext = function(delay, action) {
    this.events.push(new Event(this, delay, action));
    this.startWaiting();
    return this;
};

Director.prototype.isRunning = function() {
    return !!this.running;
};

Director.prototype.startWaiting = function() {
    if(!this.running && this.events.length > 0) {
        this.running = this.events.shift();
        this.running.start();
    }
};

Director.prototype.clear = function() {
    if(!this.running) {
        this.running.cancel();
    }
    this.events = [];
};

Director.prototype.eventComplete = function() {
    this.running = false;
    this.startWaiting();
};

function Event(director, delay, action) {
    this.director = director;
    this.delay = delay;
    this.action = action;
    this.timer = null;
};

Event.prototype.start = function() {
    var self = this;
    this.timer = setTimeout(function() {
        self.action(self);
    }, this.delay);
};

Event.prototype.cancel = function() {
    clearTimeout(this.timer);
};

Event.prototype.complete = function() {
    this.director.eventComplete();
};

function Player(name, color) {
    this.name = name;
    this.color = color;
};

function Rect(tl, br) {
    this.tl = tl;
    this.br = br;
}

Rect.prototype.scale = function(x, y) {
    return new Rect(this.tl.scale(x, y), this.br.scale(x, y));
};

Rect.prototype.width = function() {
    return this.br.x - this.tl.x;
};

Rect.prototype.height = function() {
    return this.br.y - this.tl.y;
};

Rect.prototype.center = function() {
    var x = (this.tl.x + this.br.x) / 2.0;
    var y = (this.tl.y + this.br.y) / 2.0;
    return new Vector(x, y);
};

Rect.prototype.union = function(r) {
    var tl = new Vector(Math.min(this.tl.x, r.tl.x),
                        Math.min(this.tl.y, r.tl.y));
    var br = new Vector(Math.max(this.br.x, r.br.x),
                        Math.max(this.br.y, r.br.y));
    return new Rect(tl, br);
};

Rect.prototype.contains = function(v) {
    return !(v.x < this.tl.x || v.x > this.br.x || v.y < this.tl.y || v.y > this.br.y);
};

function Vector(x, y) {
    this.x = x;
    this.y = y;
}

Vector.prototype.scale = function(x, y) {
    return new Vector(this.x * x, this.y * y);
};

function Place(board, player, score_cup, rect, pieces, position) {
    this.board = board;
    this.player = player;
    this.score_cup = score_cup;
    this.rect = rect;
    this.pieces = pieces;
    this.position = position;
};

Place.prototype.director = function() {
    return this.board.director;
};

Place.prototype.step_delay = 300;

Place.prototype.click = function() {
    // valid move?
    if(this.score_cup) return;

    // belongs to player?
    if(this.player != this.board.player()) return;

    // something to distribute?
    if(this.pieces == 0) return;

    // distribute the pieces
    var pieces = this.pieces;
    var place = null;

    var self = this;
    this.director().addNext(0, function(ev) {
        self.pieces = 0;
        ev.complete();
    });
    var ii = 0;
    while(pieces > 0) {
        ii += 1;
        var place_idx = (this.position + ii) % this.board.places.length;
        place = this.place(place_idx);
        if(!place.score_cup || place.player == this.player) {
            pieces -= 1;
            (function(place) {
                self.director().addNext(self.step_delay, function(ev) {
                    place.pieces += 1;
                    ev.complete();
                });
            })(place);
        }
    }

    // do we get a steal
    if(!place.score_cup && place.pieces == 0 && place.player == this.player) {
        var opposite = place.opposite();
        this.director().addNext(this.step_delay, function(ev) {
            self.board.scoreCup(self.player).pieces += opposite.pieces;
            opposite.pieces = 0;
            ev.complete();
        });
    }

    if(!(place.score_cup && place.player == this.player)) {
        // we don't get another move
        this.director().addNext(this.step_delay, function(ev) {
            self.board.advancePlayer();
            ev.complete();
        });
    }

    // win check after animation completes
    this.director().addNext(this.step_delay, function(ev) {
        self.board.winner = self.board.checkWin();
        ev.complete();
    });
};

Place.prototype.place = function(idx) {
    return this.board.places[idx];
};

Place.prototype.opposite = function() {
    var idx = 12 - this.position;
    return this.place(idx);
};

/* game coords:
 *
 *    0   1   2   3   4   5   6   7
 * 0 S1  P1  P1  P1  P1  P1  P1  S0
 * 1 S1                          S1
 * 2 S1  P0  P0  P0  P0  P0  P0  S0
 *
 * Linear numbering begins with P0 and proceeds counter-clockwise.
 */
var BOARD = 0;
var PIECE = 1;

function GameBoard(canvas, graphics) {
    this.canvas = canvas;
    this.graphics = graphics;
    this.director = new Director();
    this.places = [];
    this.players = [new Player('Red', '#ff0000'),
                    new Player('Green', '#00ff00')];
    this.winner = null;

    for(var ii = 0; ii < 14; ++ii) {
        var player = this.players[0];
        var score_cup = false;
        if(ii > 6) {
            player = this.players[1];
        }
        if(ii == 6 || ii == 13) {
            score_cup = true;
        }

        var rect;
        if(ii == 6) {
            rect = new Rect(new Vector(7, 0), new Vector(8, 3));
        } else if(ii == 13) {
            rect = new Rect(new Vector(0, 0), new Vector(1, 3));
        } else if(ii < 6) {
            rect = new Rect(new Vector(ii+1, 2), new Vector(ii+2, 3));
        } else {
            rect = new Rect(new Vector(13-ii, 0), new Vector(14-ii, 1));
        }

        var pieces = 4;
        if(score_cup) pieces = 0;

        this.places.push(new Place(this, player, score_cup, rect, pieces, ii));
    }

    this.current_player_number = 0;
}

GameBoard.prototype.scaleX = 70;
GameBoard.prototype.scaleY = 70;
GameBoard.prototype.color = '#aaaa33';
GameBoard.prototype.padding = 10;

GameBoard.prototype.player = function() {
    return this.players[this.current_player_number];
};

GameBoard.prototype.advancePlayer = function() {
    var next = this.current_player_number + 1;
    this.current_player_number = (next % 2);
};

GameBoard.prototype.extent = function() {
    var rect = this.places[0].rect;
    for(var ii = 0; ii < this.places.length; ++ii) {
        rect = rect.union(this.places[ii].rect);
    }
    return rect;
};

GameBoard.prototype.render = function() {
    var ctx = this.canvas.getContext('2d');
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    var background = this.extent().scale(this.scaleX, this.scaleY);
    ctx.drawImage(this.graphics[BOARD], 0, 0, background.width(), background.height());

    var str = null;
    if(this.winner) {
        str = this.winner.name + ' wins!';
    } else {
        str = this.player().name + "'s turn";
    }
    ctx.font = '60px sans-serif';
    var str_width = ctx.measureText(str).width;
    var center = background.center();

    ctx.fillStyle = '#000000';
    ctx.fillText(str, center.x - str_width / 2, center.y + 19);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(str, center.x - str_width / 2, center.y + 20);

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.0;

    ctx.fillStyle = this.color;
    ctx.strokeRect(background.tl.x, background.tl.y, background.width(), background.height());

    for(var ii = 0; ii < this.places.length; ++ii) {
        var place = this.places[ii];
        ctx.fillStyle = place.player.color;
        ctx.strokeStyle = place.player.color;
        var rect = place.rect.scale(this.scaleX, this.scaleY);
        var w = rect.width();
        var h = rect.height();
        ctx.strokeRect(rect.tl.x, rect.tl.y, w, h);

        if(place.pieces > 0) {
            ctx.drawImage(this.graphics[PIECE], rect.tl.x, rect.tl.y, w, h);

            center = rect.center();
            ctx.font = '60px sans-serif';

            str = String(place.pieces);
            var metrics = ctx.measureText(str);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(String(place.pieces), center.x - metrics.width / 2, center.y + 20);
            ctx.fillStyle = '#000000';
            ctx.fillText(String(place.pieces), center.x - metrics.width / 2, center.y + 19);
        }
    }
};

GameBoard.prototype.P1_GOAL = 6;
GameBoard.prototype.P2_GOAL = 13;

GameBoard.prototype.scoreCup = function(player) {
    if(player == this.players[0]) {
        return this.places[this.P1_GOAL];
    } else {
        return this.places[this.P2_GOAL];
    }
};

GameBoard.prototype.checkWin = function() {
    // check to see if player 1 has remaining moves
    var all_blank = true;
    var have_winner = false;
    for(var ii = 0; ii < 6; ++ii) {
        if(this.places[ii].pieces > 0) {
            all_blank = false;
            break;
        }
    }

    if(all_blank) {
        have_winner = true;

        // sweep player 2's pieces into their goal
        for(ii = 7; ii < 13; ++ii) {
            this.places[this.P2_GOAL].pieces += this.places[ii].pieces;
            this.places[ii].pieces = 0;
        }
    }

    // check to see if player 2 has remaining moves
    all_blank = true;
    for(ii = 7; ii < 13; ++ii) {
        if(this.places[ii].pieces > 0) {
            all_blank = false;
        }
    }

    if(all_blank) {
        have_winner = true;

        // sweep player 1's pieces into their goal
        for(ii = 0; ii < 6; ++ii) {
            this.places[this.P1_GOAL].pieces += this.places[ii].pieces;
            this.places[ii].pieces = 0;
        }
    }

    if(have_winner) {
        if(this.places[this.P2_GOAL].pieces > this.places[this.P1_GOAL].pieces) {
            return this.players[1];
        } else {
            return this.players[0];
        }
    }

    return null;
};

GameBoard.prototype.clickHandler = function(canvas, event) {
    // no clicks if we're animating
    if(this.director.isRunning()) return true;
    if(this.winner) return true;

    for(var ii = 0; ii < this.places.length; ++ii) {
        var place = this.places[ii];
        if(place.rect.scale(this.scaleX, this.scaleY).contains(canvas.relMouseCoords(event))) {
            place.click();
            break;
        }
    }

    return true;
};

GameBoard.prototype.scaleToFill = function(canvas) {
    var extent = this.extent();
    var width = extent.width();
    var height = extent.height();
    this.scaleX = canvas.width / width;
    this.scaleY = canvas.height / height;
};

HTMLCanvasElement.prototype.relMouseCoords = function(event) {
    if (event.offsetX !== undefined && event.offsetY !== undefined) {
        return new Vector(event.offsetX, event.offsetY);
    }

    var totalOffsetX = 0;
    var totalOffsetY = 0;
    var canvasX = 0;
    var canvasY = 0;
    var currentElement = this;

    do{
        totalOffsetX += currentElement.offsetLeft - currentElement.scrollLeft;
        totalOffsetY += currentElement.offsetTop - currentElement.scrollTop;
    }
    while((currentElement = currentElement.offsetParent))

    canvasX = event.pageX - totalOffsetX;
    canvasY = event.pageY - totalOffsetY;

    return new Vector(canvasX, canvasY);
};

function drawLoading(canvas) {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '30px sans-serif';
    ctx.fillStyle = '#666666';
    ctx.fillText("Loading...", 0, canvas.height / 2 + 10);
}

function storeImage(url, ev, name, target) {
    var img = new Image();
    img.onload = function() {
        target[name] = img;
        ev.complete();
    };
    img.src = url;
}

function init() {
    var canvas = document.getElementById('board');
    drawLoading(canvas);

    var graphics = {};

    var loader = new Director();
    loader.addNext(0, function(ev) {
        storeImage('board.png', ev, BOARD, graphics);
    }).addNext(0, function(ev) {
        storeImage('piece.png', ev, PIECE, graphics);
    }).addNext(0, function(ev) {
        startGame(canvas, graphics);
        ev.complete();
    });
}

function startGame(canvas, graphics) {
    var gb = new GameBoard(canvas, graphics);

    // disable touch dragging
    document.ontouchmove = function(e) {
        e.preventDefault();
    };
    canvas.onclick = gb.clickHandler.bind(gb, canvas);

    var onresize = function() {
        var width = window.innerWidth;
        var height = window.innerHeight;
        if(width != canvas.width) {
            canvas.width = width;
            canvas.height = height;
            gb.scaleToFill(canvas);
        }
    };

    onresize();
    window.onresize = onresize;

    // set up render loop. pretty wasteful given how rarely what we
    // render changes but safari isn't reliable otherwise.
    var onFrame = window.requestAnimationFrame ||
            window.mozRequestAnimationFrame ||
            window.webkitRequestAnimationFrame;


    var render = function() {
        gb.render();
        onFrame(render);
    };
    render();
}
