/* COMPONENT-syncetc-tool-header-v5.js | TRUE shared SyncEtc header component with Tools button | Generated: 2026-06-04 */
(function(){
  "use strict";

  var LOGO_URL="https://ocdaohkiwonjmirqkjww.supabase.co/storage/v1/object/public/public-site-assets/!SyncEtc-branding/SyncEtc-logo-compact.png";
  var STYLE_ID="syncetc-tool-header-v5-style";

  function clean(v){return String(v==null?"":v).trim();}
  function esc(s){return clean(s).replace(/[&<>"']/g,function(ch){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[ch];});}

  function css(){
    return [
      ".syncetc-tool-header{position:relative;overflow:hidden;border:1px solid rgba(7,22,51,.12);border-radius:30px;background:linear-gradient(135deg,rgba(255,255,255,.97),rgba(239,248,255,.97));padding:24px 28px;box-shadow:0 20px 60px rgba(7,22,51,.09);margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}",
      ".syncetc-tool-header:before{content:'';position:absolute;inset:auto -120px -160px auto;width:340px;height:340px;border-radius:999px;background:linear-gradient(135deg,rgba(0,164,224,.14),rgba(255,91,0,.13));filter:blur(4px)}",
      ".syncetc-tool-header-main{position:relative;min-width:220px;flex:1}",
      ".syncetc-tool-header-brandline{display:flex;align-items:center;gap:0;flex-wrap:wrap;margin:0}",
      ".syncetc-tool-header-logo{display:block;width:180px;max-width:46vw;height:auto}",
      ".syncetc-tool-header-nav{position:relative;display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}",
      ".syncetc-tool-header-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(7,22,51,.16);border-radius:999px;padding:10px 14px;background:#fff;color:#071633!important;text-decoration:none!important;font-weight:950;font-size:13px;box-shadow:0 8px 22px rgba(7,22,51,.08);white-space:nowrap}",
      ".syncetc-tool-header-btn.is-active{background:#071633;color:#fff!important;border-color:#071633;box-shadow:0 10px 24px rgba(7,22,51,.16)}",
      ".syncetc-tool-header-btn:focus{outline:3px solid rgba(0,164,224,.30);outline-offset:2px}",
      "@media(max-width:760px){.syncetc-tool-header{padding:22px;align-items:flex-start}.syncetc-tool-header-logo{width:150px}.syncetc-tool-header-nav{justify-content:flex-start}}"
    ].join("\n");
  }

  function installStyle(){
    if(document.getElementById(STYLE_ID))return;
    var style=document.createElement("style");
    style.id=STYLE_ID;
    style.textContent=css();
    document.head.appendChild(style);
  }

  function button(label,href,active,onClick){
    var b='<a class="syncetc-tool-header-btn '+(active?'is-active':'')+'" href="'+esc(href)+'">'+esc(label)+'</a>';
    if(onClick){
      setTimeout(()=>{ // defer to ensure DOM exists
        var el=document.querySelector('.syncetc-tool-header-nav a[href="'+href+'"]');
        if(el) el.addEventListener("click",(e)=>{e.preventDefault();onClick(e);});
      },0);
    }
    return b;
  }

  function render(options){
    options=options||{};
    installStyle();
    var active=clean(options.active||"");
    var logo=clean(options.logoUrl||LOGO_URL);

    // Render the header
    var html = '<section class="syncetc-tool-header">'
      + '<div class="syncetc-tool-header-main"><div class="syncetc-tool-header-brandline"><img class="syncetc-tool-header-logo" src="'+esc(logo)+'" alt="SyncEtc"></div></div>'
      + '<nav class="syncetc-tool-header-nav" aria-label="SyncEtc tools">'
      + button("Hub","/syncetc-landing-page",active==="hub")
      + button("Customer Manager","/customer-manager",active==="customer-manager")
      + button("Layout Designer","/design-studio",active==="layout-designer")
      + button("Page Setup","/page-builder",active==="page-setup")
      + button("Tools","#",false,()=>{
          var widget=document.getElementById("syncetc-dragdrop-widget-root");
          if(!widget){widget=document.createElement("div");widget.id="syncetc-dragdrop-widget-root";document.body.appendChild(widget);}
          widget.style.display=(widget.style.display==="none"||widget.style.display==="")?"block":"none";
      })
      + '</nav></section>';

    return html;
  }

  window.SyncEtcToolHeader={render:render,css:css,installStyle:installStyle,logoUrl:LOGO_URL};
})();