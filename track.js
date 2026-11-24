(function(){
  var q=new URLSearchParams(location.search);
  function send(b){
    try{
      var j=JSON.stringify(b);
      if(j.length>1800)return;
      var blob=new Blob([j],{type:"application/json"});
      if(!(navigator.sendBeacon&&navigator.sendBeacon("/api/t",blob)))
        fetch("/api/t",{method:"POST",headers:{"content-type":"application/json"},body:j,keepalive:true}).catch(function(){});
    }catch(e){}
  }
  send({t:"view",p:location.pathname,r:(document.referrer||"").slice(0,300),us:q.get("utm_source")||"",um:q.get("utm_medium")||"",uc:q.get("utm_campaign")||"",ut:q.get("utm_content")||"",un:q.get("utm_term")||""});
  addEventListener("click",function(e){
    var n=e.target&&e.target.closest&&e.target.closest("[data-track]");
    if(!n)return;
    send({t:"click",p:location.pathname,e:n.getAttribute("data-track")||""});
  },true);
})();
