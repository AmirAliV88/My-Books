(function() {


// ------ تنظیمات اولیه PDF.js ------
const pdfjsLib = window.pdfjsLib;
if (pdfjsLib.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// ------ عناصر DOM ------
const FileInput = document.getElementById('FileInput');
const FileNs = document.getElementById('FileName');
const Status = document.getElementById('Status');
const canvas = document.getElementById('pdfCanvas');
const ctx = canvas.getContext('2d');
const plct = document.getElementById('placeholder'); // placeholder context
const prevBtn = document.getElementById('PrevPage');
const nextBtn = document.getElementById('NextPage');
const firstBtn = document.getElementById('GoToFirst');
const lastBtn = document.getElementById('GoToLast');
const pageIndicator = document.getElementById('PageIndicator');

// ------ متغیرهای وضعیت ------
let pdfDoc = null;
let curPage = 1;
let tPage = 0;
let scale = 1.5;
let Rendering = false;
let RenderTask = null;

// ------ توابع کمکی ------
function setStatus(text, type='') { Status.textContent = text; Status.className = 'Status'+(type?' '+type:''); }

function updateButtons() {
    if (!pdfDoc || tPage === 0) {
        prevBtn.disabled = true; nextBtn.disabled = true; firstBtn.disabled = true; lastBtn.disabled = true;
        pageIndicator.textContent = 'صفحه ۰ از ۰';
        return;
    }
    prevBtn.disabled = (curPage<=1); nextBtn.disabled = (curPage>=tPage); 
    firstBtn.disabled = (curPage<=1); lastBtn.disabled = (curPage>=tPage); 
    pageIndicator.textContent = `صفحه ${curPage} از ${tPage}`;
}

// ------ تابع اصلی برای رندر با تصحیح فاصله حروف ------
function renderPageWithFixedText(pageNumber) {
    if (!pdfDoc) { plct.style.display = 'block'; canvas.style.display = 'none'; return; }
    if (RenderTask) { RenderTask.cancel(); RenderTask = null; }
    plct.style.display = 'block'; plct.textContent = '⏳ Loading...'; canvas.style.display = 'none';
    Rendering = true; setStatus('Rendering...', 'loading');
    pdfDoc.getPage(pageNumber).then(P => {
        // محاسبه مقیاس
        const cX = canvas.parentElement.clientWidth - 40;
        const viewport = P.getViewport({ scale: 1 });
        const Xscale = cX / viewport.width;
        const optiScale = Math.min(Xscale, 2.0);
        scale = Math.max(optiScale, 0.6);
        const scaledViewport = P.getViewport({ scale: scale });
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        ctx.clearRect(0, 0, canvas.width, canvas.height); // پاک کردن canvas
            
        // ------ راه حل اصلی: رندر با تنظیمات دقیق فونت ------
        const RenCt = {
            canvasContext:ctx, viewport:scaledViewport, background:'white', enableWebGL:false, 
            fontCache:'LocalFontCache', useSystemFonts:true, disableFontFace:false, // تنظیمات حیاتی برای تصحیح فاصله حروف
            buildPath: true, // این گزینه باعث می‌شه حروف به هم نچسبند
            renderInteractiveForms: false, // برای نمایش دقیق تر حروف
            transform: [1, 0, 0, 1, 0, 0] // تنظیم برای جلوگیری از بهم ریختگی
        };

        RenderTask = P.render(RenCt); return RenderTask.promise;
    }).then(()=>{
        Rendering = false; RenderTask = null; 
        canvas.style.display = 'block'; 
        plct.style.display = 'none';
        setStatus('✅ صفحه نمایش داده شد', 'success'); updateButtons();
        fixTextSpacingOnCanvas(); // اعمال تصحیح نهایی روی canvas
            
    }).catch(err=>{
        // if (err && err.name === 'RenderingCancelledException') { console.log('رندر قبلی لغو شد'); return; }
        console.error('Error to Render:', err); 
        Rendering = false; RenderTask = null; setStatus('❌ Error to show', '');
        plct.style.display = 'block'; 
        plct.textContent = '⚠️ Error to load page'; 
        canvas.style.display = 'none'; 
        updateButtons();
    });
}

// ------ تابع تصحیح فاصله حروف روی canvas ------
function fixTextSpacingOnCanvas() {
    // این تابع سعی می‌کنه فاصله حروف رو با تنظیمات CSS تصحیح کنه
    // اما راه حل اصلی توی تنظیمات رندر هست
    try {
        // اعمال فیلترهای CSS برای بهبود نمایش
        canvas.style.imageRendering = 'auto';
        canvas.style.letterSpacing = 'normal';
        canvas.style.wordSpacing = 'normal';
    } catch(e) { null }
}

// ------ تابع استخراج و تصحیح متن (برای دیباگ) ------
function getCorrectedText(pageNum) {
    if (!pdfDoc) return Promise.resolve('');
    return pdfDoc.getPage(pageNum).then(P => {
        return P.getTextContent().then(Textct => {
            const I = textContent.items.sort((a, b)=>{
                if (a.transform[5] !== b.transform[5]) { return a.transform[5]-b.transform[5]; }
                return a.transform[4]-b.transform[4];
            });
                
            let R = ''; let lx = 0; let ly = 0; let lText = ''; let liY = 0;
                
            for (let i=0; i<I.length; i++) {
                const x = I[i].transform[4]; const y = I[i].transform[5]; const width = I[i].width||0;    
                if (i>0 && Math.abs(y-ly)>5) { result += lText.trim()+'\n'; lText = ''; liY = y; }
                if (i>0 && Math.abs(y-ly)<5) { const gap = x-(lx+(I[i-1].width||0)); if (gap > (I[i-1].width||10)*0.5) { lText += ' '; } }    
                lText += i.str; lx = x; ly = y;
            }    
            if (lText.trim()) { R += lText.trim(); }    
            R = R.replace(/\s+/g, ' '); R = R.replace(/([^\s])\s+([^\s])/g, '$1 $2');
            return R;
        });
    });
}

// ------ بارگذاری فایل PDF ------
function loadPDF(F) {
    if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
    if (RenderTask) { RenderTask.cancel(); RenderTask = null; }

    const reader = new FileReader();
    reader.onload = function(e) {
        const Arraybuff = e.target.result;
        setStatus('Proccessing...', 'loading');
        plct.style.display = 'block'; plct.textContent = '⏳ Opening the book...';
        canvas.style.display = 'none';

        const loadingTask = pdfjsLib.getDocument({
            data:Arraybuff, useSystemFonts:true, disableFontFace:false, verbosity:0, rangeChunkSize: 65536,
            standardFontDataUrl:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/standard_fonts/',
            fontExtraProperties:true, // این گزینه مهمه برای تشخیص درست حروف
            isEvalSupported:true, // برای بهبود کیفیت رندر
        });

        loadingTask.promise.then(function(doc) {
            pdfDoc = doc; tPage = doc.numPages; curPage = 1;
            FileNs.textContent = F.name + ` (${tPage} صفحه)`;
            setStatus(`✅ ${tPage} صفحه`, 'success');
            plct.textContent = '📖 کتاب باز شد، صفحه اول در حال بارگذاری...';    
            updateButtons(); renderPageWithFixedText(1);
                
        }).catch(err=>{
            console.error('Error to open PDF:', err);
            setStatus('❌ Error to open File', '');
            plct.style.display = 'block'; plct.textContent = '⚠️ فایل معتبر نیست یا خراب است.';
            canvas.style.display = 'none';
            pdfDoc = null; tPage = 0;
            updateButtons();
            FileNs.textContent = '❌ فایل نامعتبر';
        });
    };

    reader.onerror = function() { setStatus('❌ Error to read File', ''); plct.textContent = '⚠️ Error to read File from System';  };
    reader.readAsArrayBuffer(F);
}

// ------ رویدادهای کنترل ------
FileInput.addEventListener('change', function(e) {
    const F = e.target.files[0];
    if (!F) return;
    if (F.type!=='application/pdf' && !F.name.toLowerCase().endsWith('.pdf')) {
        setStatus('❌ Please select a PDF File', ''); FileNs.textContent = '⚠️ Don\'t support File formatt'; return;
    }
    loadPDF(F); FileInput.value = '';
});

// ------ توابع ناوبری ------
function goToPage(pageNum) {
    if (!pdfDoc) return;
    if (pageNum<1) pageNum = 1;
    if (pageNum>tPage) pageNum = tPage;
    if (pageNum===curPage && pdfDoc) {
        if (canvas.style.display === 'none') { renderPageWithFixedText(pageNum); } return;
    }
    curPage = pageNum; renderPageWithFixedText(curPage);        
}

prevBtn.addEventListener('click', function() { if (pdfDoc && curPage>1) { goToPage(curPage-1); } });
nextBtn.addEventListener('click', function() { if (pdfDoc && curPage<tPage) { goToPage(curPage+1); } });
firstBtn.addEventListener('click', function() { if (pdfDoc) { goToPage(1); }});
lastBtn.addEventListener('click', function() { if (pdfDoc) { goToPage(tPage); } });

let reszTimer = null;
window.addEventListener('resize', function() {
    if (pdfDoc) {
        clearTimeout(reszTimer);
        reszTimer = setTimeout(() => { if (pdfDoc && curPage>=1 && curPage<=tPage) { renderPageWithFixedText(curPage); } }, 300);
    }
});


// ------ شروع: وضعیت اولیه ------
setStatus('⏳ آماده', '');
updateButtons();
plct.style.display = 'block'; plct.textContent = '📚 یک فایل PDF انتخاب کنید';
canvas.style.display = 'none';
FileNs.textContent = 'هیچ فایلی انتخاب نشده';


})();
