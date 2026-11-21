/* records what the page draws; enough of jsPDF's surface for the card exporters */
(function(){
  function J(o){ this.calls = []; this.pages = 1; this.cur = 1; this.fs = 12; window.__pdf = this; this.internal = {scaleFactor:1, pageSize:{getWidth:function(){return 612}, getHeight:function(){return 792}}}; }
  var P = J.prototype;
  P.text = function(t, x, y, o){ this.calls.push({op:"text", t:String(t), x:x, y:y, page:this.cur}); return this; };
  P.getTextWidth = function(s){ return String(s).length * this.fs * 0.5; };
  P.setFontSize = function(n){ this.fs = n; return this; };
  P.getFontSize = function(){ return this.fs; };
  P.addPage = function(){ this.pages++; this.cur = this.pages; return this; };
  P.getNumberOfPages = function(){ return this.pages; };
  P.setPage = function(n){ this.cur = n; return this; };
  P.splitTextToSize = function(t, w){ var per = Math.max(10, Math.floor(w / (this.fs * 0.5))), out = []; t = String(t); while(t.length > per){ var i = t.lastIndexOf(" ", per); if(i < 1) i = per; out.push(t.slice(0, i)); t = t.slice(i).trim(); } out.push(t); return out; };
  P.output = function(){ return new Blob(["%PDF-mock"], {type:"application/pdf"}); };
  P.addImage = function(){ this.calls.push({op:"image", page:this.cur}); return this; };
  var noop = ["setFont","setTextColor","setDrawColor","setFillColor","setLineWidth","line","rect","circle","lines","clip","discardPath",
    "saveGraphicsState","restoreGraphicsState","setLineDashPattern","setLineJoin","setLineCap","addFileToVFS","addFont","setCharSpace","roundedRect","ellipse","triangle","setGState","GState","path","fill","stroke","moveTo","lineTo","close","curveTo"];
  noop.forEach(function(n){ if(!P[n]) P[n] = function(){ return this; }; });
  P.GState = function(o){ return o; };
  window.jspdf = {jsPDF:J};
})();
