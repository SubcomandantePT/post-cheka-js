// ==UserScript==
// @name        Reddit Post Cheka
// @namespace   reddit-post-cheka
// @include     https://www.reddit.com/*
// @updateURL	https://github.com/SubcomandantePT/post-cheka-js/raw/master/Reddit_Post_Cheka.meta.js
// @downloadURL	https://github.com/SubcomandantePT/post-cheka-js/raw/master/Reddit_Post_Cheka.user.js
// @version     1.0.2
// @grant       none
// ==/UserScript==


// slurs & questionable words
BLACKLIST = [
	"\\bnig(\\b|g?(a|er)?s?)\\b",
	"dindu(s?)",
	"mudslime?s?",
	"kikes?",
	"mongoloids?",
	"towel\\s*heads?",
	"\\bspi(c|k|ck)s?\\b",
	"\\bchinks?",
	"niglets?",
	"beaners?",
	"\\bnips?\\b",
	"\\bcoons?\\b",
	"jungle\\s*bunn(y|ies?)",
	"jigg?aboo?s?",
	"\\bpakis?\\b",
	"rag\\s*heads?",
	"gooks?",
	"g(y|i)ps(y|ies?)",
	"jewe?y",
	"jewed",
	"\\bg(ip|yp)\\b",
	
	"cunts?",
	"bitch(es|ing|y)?",
	"puss(?!y\\s?foot)(y|ies?)?",
	"whor(es?|ing)",
	"\\bslut(s|t?y)?",
	"hysterical",
	
	"cock\\s?sucker(s|ing)?",
	"fagg?(s|ots?|y)?\\b",
	"twats?",
	"\\btrann?(y|ies?)",
	
	"craz(y|iest|ies)",
	"insan(e|ity)",
	"idiot(s|ic)?",
	"moron(s|ic)?",
	"retard",
	"retarded",
	"retards",
	"\\btard(s|ed)?\\b",
	"lib(er)?tard(s|ed)?",
	"fucktard(s|ed)?",
	"spaz(es)?",
	"spastics?",
	"stupid(ity)?",
	"dumb(?!\\s?(found|struck|bell))(est|er)?",
	"dumbies",
	"\\bspergs?\\b",
	
	"tank(y|ies)",
	"stalin(ite|ism|ist)",
	
	"\\bre{3,}\\b",
	"feminazis?",
	"snowflake",
	"sj(ew|w)",
	"tumblrina",
	"attack helicopter",
	"sexually identify",
	"ephebophil(e|ia)",
	"🅱",
	"(deus|desu) vult",
	"triggered",
	"cuck",
];

//jQuery.noConflict()
$(function(){

/********************************
	MAIN APP CLASS
********************************/
function PostCheka($){
	// variables
	var self = this;
	self.blacklist = [];
	self.users = {};
	self.window;
	
	
	// call constructor
	init();
	
	
	// constructor
	function init(){
		self.window = new ReviewWindow(self);
		
		init_html();
		init_events();
		
		// compile blacklist regex
		$.each(BLACKLIST, function(i, v){
			self.blacklist.push(new RegExp(v, "ig"));
		});
	}
	
	// initialize html and css
	function init_html(){
		// create [R] buttons next to usernames
		var button = $("<a class='user-review-button tb-bracket-button' href='#' title='Review post history' style='margin-left:3px'>R</a>");
		if (button.is("div")) button = $(button.get(1)); // fix for a weird bug where <a> gets wrapped in a <div>
		
		$(".tagline .author").each(function(){
			var user = $(this).text().trim();
			if (!user || user == "[deleted]") return;
			var b = button.clone();
			$(this).parent().find(".userattrs").after(b);
		});
	}
	
	function init_events(){
		// review button click
		$(document).delegate(".user-review-button", "click", function(e){
			e.preventDefault();
			var username = $(this).parent().find(".author").text().trim();
			if (!username || username == "[deleted]"){
				alert("Invalid user to review");
				return;
			}
			
			var user = new User(username, self);
			self.users[user.name] = user;
			self.window.open();
			self.window.review(user);
		});
		
		// esc key
		$(window).keydown(function(e){
			if (e.which == 27){
				self.window.close();
			}
		});
	}
}


/********************************
	USER CLASS
********************************/
function User(name, core){
	var self = this;
	self.name = name;
	self.posts = [];
	self.matches = [];
	self.matched_words = {};
	self.getting_data = false;
	self.fetch_complete = false;
	
	self.add_word = add_word;
	
	function add_word(word){
		word = word.toLowerCase();
		if (!self.matched_words[word]) self.matched_words[word] = 0;
		self.matched_words[word]++;
	}
}


/********************************
	POST CLASS
********************************/
function Post(data){
	var self = this;
	self.matches = [];
	self.text = null;
	self.html = null;
	self.title = null;
	self.subreddit = null;
	self.url = null;
	self.created = null;
	self.timestamp = "";
	self.time_ago = "";
	self.points = 0;
	
	self.add_word = add_word;
	
	function add_word(word){
		if (self.matches.indexOf(word.toLowerCase()) < 0) self.matches.push(word.toLowerCase());		
	}
}


/********************************
	REVIEW WINDOW CLASS
********************************/
MODE_LOADING = "loading";
MODE_REVIEWING = "reviewing";

function ReviewWindow(core){
	var self = this;
	self.state_open = false;
	self.mode = MODE_LOADING;
	self.element;
	self.post_template;
	
	self.open = open;
	self.close = close;
	self.is_open = is_open;
	self.log = log;
	self.review = review;
	
	
	init();
	
	
	function review(user){
		// review user's post history up to 1000 posts back
		set_mode(MODE_LOADING);
		set_user(user);
		review_loop(user, "");
	}
	
	function review_loop(user, after){
		$.get("/user/" + user.name + "/overview.json?limit=100&after=" + after).fail(function(){
			console.log("User " + user.name + " shadowbanned?");
			alert("Unable to load data, user shadowbanned?");
		}).done(function(d, status, request){
			var headers = request.getAllResponseHeaders().split("\n").reduce(function(acc, current, i){
				var parts = current.split(": ");
				acc[parts[0]] = parts[1];
				return acc;
			}, {});
			// console.log(headers["x-ratelimit-remaining"]);
			
			// review submissions
			$.each(d.data.children, function(i, v){
				// collate post data
				var data = v.data;
				var post = new Post();
				if (data.title){
					post.text = data.selftext;
					post.html = $("<div>").html(data.selftext_html).text();
					post.title = data.title;
					post.url = data.url;
				} else {
					post.text = data.body;
					post.html = $("<div>").html(data.body_html).text();
					post.url = data.link_permalink + data.id + "/";
				}
				
				post.subreddit = data.subreddit;
				post.created = data.created_utc;
				post.timestamp = timeConverter(post.created);
				post.time_ago = timeSince(post.created) + " ago";
				post.points = data.score;
				
				// store post on user
				user.posts.push(post);
				self.element.find(".total-posts").text(user.posts.length);
				
				// review post
				var has_match = false;
				$.each(core.blacklist, function(ii, pattern){
					var body_match = pattern.exec(post.text);
					if (body_match){
						has_match = true;
						post.html = post.html.replace(pattern, "<span class='review-highlight'>" + body_match[0] + "</span>");
						post.add_word(body_match[0]);
						user.add_word(body_match[0]);
					}
					
					var title_match = pattern.exec(post.title);
					if (title_match){
						has_match = true;
						post.title = post.title.replace(pattern, "<span class='review-highlight'>" + title_match[0] + "</span>");
						post.add_word(title_match[0]);
						user.add_word(title_match[0]);
					}
				});
				
				// store match & add to window
				if (!has_match) return;
				user.matches.push(post);
				add_post(user, post);
			});
			
			// either stop or keep going
			after = d.data.after;
			if (!after || $.isEmptyObject(d.data.children)){
				set_mode(MODE_REVIEWING);
				if (!user.matches.length){
					self.element.find(".post-display-container")
						.html("No matched posts found; fetched " + user.posts.length + " posts");
				}
				console.log("done fetching user submissions; fetched " + user.posts.length + " posts total; " + user.matches.length + " matches found");
				return;
			} else {
				review_loop(user, after);
			}
		});
	}
	
	function add_post(user, post){
		var e = self.element;
		
		var temp = self.post_template.clone();
		temp.find(".username").text(user.name);
		temp.find(".points").text(post.points + " point" + (post.points == 1 ? "" : "s"));
		temp.find(".timestamp").text(post.timestamp);
		temp.find(".time-ago").text("(" + post.time_ago + ")");
		temp.find(".subreddit").text("/r/" + post.subreddit).attr("href", "/r/" + post.subreddit);
		temp.find(".thread-title").append(post.title);
		temp.find(".post-content").append(post.html);
		temp.find(".post-url").attr("href", post.url);
		temp.find(".post-matches").text(post.matches.sort().join(", "));
		
		e.find(".post-display-container").append(temp);
		
		// total match count
		e.find(".total-matches").text(user.matches.length);
		
		// all matched words
		var all_matches = [];
		$.each(user.matched_words, function(k, v){
			all_matches.push([k + "<sup>(" + v + ")</sup>", v]);
		});
		all_matches.sort(function(a, b){
			return b[1] - a[1];
		});
		var match_string = all_matches.map(function(c, i, a){
			return c[0];
		});
		
		e.find(".all-matched-words").html("<b>All matches: </b>" + match_string.join(", "));
		//e.find(".all-matched-words").html("<b>All matches: </b>" + user.matched_words.sort().join(", "));
	}
	
	function set_user(user){
		self.element.find(".review-username").text(user.name)
					.attr("href", "/user/" + user.name);
	}
	
	function set_mode(mode){
		self.mode = mode;
		self.element.find(".review-mode").text(mode);
	}
	
	function open(){
		if (is_open()) return;
		self.state_open = true;
		self.element.addClass("open");
		self.element.find(".post-display-container").html("");
		self.element.find(".all-matched-words").html("");
		self.element.find(".total-matches").text("0");
		self.element.find(".total-posts").html("0");
		$("body").css("overflow", "hidden");
	}
	
	function close(){
		if (!is_open()) return;
		self.state_open = false;
		self.element.removeClass("open");
		self.element.find(".post-display-container").html("");
		$("body").css("overflow", "");
	}
	
	function is_open(){
		return self.state_open;
	}
	
	function log(msg){
		var elem = $("<p class='review-log'>").text(msg);
		self.element.find(".").append(elem);
		console.log("[Cheka Log]: " + msg);
	}
	
	// create window html and css
	function init(){
		var css_variables = {
			"@text_color": "#111"
		};
		
		var css = (function(){/*
			////////////////////////////////
			// CHEKA WINDOW
			////////////////////////////////
			#cheka-review{
				display: none;
				position: fixed;
				top: 0; bottom: 0;
				left: 0; right: 0;
				background-color: rgba(0, 0, 0, .8);
				z-index: 9999;
			}
			
			#cheka-review.open{
				display: block;
			}
			
			.cheka-container{
				position: absolute;
				top: 20px; bottom: 40px;
				left: 20px; right: 20px;
				background-color: #f0f0f0;
				border: 1px solid #ccc;
				padding: 8px;
				z-index: 9999;
				font-size: 12px;
			}
			
			.review-header h1{
				margin: 0; padding: 0;
			}
			
			.review-header .review-close{
				position: absolute;
				top: 0; right: 0;
				margin: 8px 15px;
				font-size: 20px;
				cursor: pointer;
				color: #555;
			}
			
			
			////////////////////////////////
			// OVERVIEW
			////////////////////////////////
			.review-username{
				font-weight: bold;
			}
			
			.review-overview .all-matched-words{
				display: block;
				background-color: #fff;
				border: 1px solid #ddd;
				padding: 4px 8px;
				margin: 4px 0px;
				overflow-y: scroll;
				max-height: 30px;
			}
			
			
			////////////////////////////////
			// POST CONTAINER
			////////////////////////////////
			.post-display-container{
				background-color: #fff;
				border: 1px solid #ddd;
				position: absolute;
				top: 112px; bottom: 8px;
				left: 8px; right: 8px;
				overflow-y: scroll;
				padding: 8px;
			}
			
			.review-post{
				padding-bottom: 15px;
				margin-bottom: 15px;
				border-bottom: 1px solid #ddd;
			}
			
			.post-header{
				color: #777;
			}
			
			.post-header .time-ago{
				font-size: 10px;
			}
			
			.post-header .subreddit, .post-header .points, .post-header .thread-title{
				font-weight: bold;
			}
			
			.post-content{
				padding: 4px 8px;
			}
			
			.review-post .review-highlight{
				//font-weight: bold;
				background-color: rgba(255, 60, 0, .5);
				color: #222;
				padding: 0 2px;
			}
		*/}).toString().match(/[^]*\/\*([^]*)\*\/\}$/)[1];
		
		// replace css variables; remove single line comments
		$.each(css_variables, function(k, v){
			var re = new RegExp(k, "g");
			css = css.replace(re, v);
		});
		css = css.replace(/\/\/.*/g, ""); // remove "//" comments
		$("html").append("<style id='cheka-style'>"+css+"</style>");
		
		// create html
		var html = (function(){/*
			<div id="cheka-review">
				<div class="cheka-container">
					<div class="review-header"><h1>☭ Post History Cheka ☭</h1><span class="review-close">&times;</span></div>
					<div class="review-overview">
						<h3><span class="review-mode">Loading</span> user <a href="#" class="review-username" target="_blank">...</a></h3>
						Total posts matched: <span class="total-matches">0</span>/<span class="total-posts">0</span>
						<br>
						<div class="all-matched-words"></div>
					</div>
					<hr>
					<div class="post-display-container">
						<div class="review-post review-post-template">
							<div class="post-header">
								<span class="thread-title"></span> to <a class="subreddit" href="#" target="_blank"></a> <span class="points">0 points</span> <span class="timestamp"></span> <span class="time-ago"></span>
								<br>
								Matches on: <span class="post-matches"></span>
							</div>
							<div class="post-content"></div>
							<a class="post-url" href="#" target="_blank">permalink</a>
						</div>
					</div>
				</div>
			</div>
		*/}).toString().match(/[^]*\/\*([^]*)\*\/\}$/)[1];
		
		self.element = $(html);
		self.element.find(".review-close").click(function(){ self.close(); });
		self.post_template = self.element.find(".review-post-template").detach().removeClass("review-post-template");
		$("body").append(self.element);
	}
}

// timestamp helper function
function timeConverter(UNIX_timestamp){
	var a = new Date(UNIX_timestamp * 1000);
	var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
	var year = a.getFullYear();
	var month = a.getMonth();
	var date = a.getDate();
	var hour = a.getHours();
	var min = a.getMinutes();
	var sec = a.getSeconds();
	var time = year + "-" + month + "-" + date + " " + hour + ":" + min;
	return time;
}

function timeSince(UNIX_timestamp){
	var seconds = Math.floor((new Date() - new Date(UNIX_timestamp * 1000)) / 1000);
	var interval = Math.floor(seconds / 31536000);

	if (interval > 1) return interval + " years";
	
	interval = Math.floor(seconds / 2592000);
	if (interval > 1) return interval + " months";
	
	interval = Math.floor(seconds / 86400);
	if (interval > 1) return interval + " days";
	
	interval = Math.floor(seconds / 3600);
	if (interval > 1) return interval + " hours";
	
	interval = Math.floor(seconds / 60);
	if (interval > 1) return interval + " minutes";
	
	return Math.floor(seconds) + " seconds";
}

String.prototype.replaceAll = function(search, replacement){
	var target = this;
	return target.split(search).join(replacement);
};

window.postcheka = new PostCheka($);
});