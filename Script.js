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
    const plct = document.getElementById('placeholder');
    const prevBtn = document.getElementById('PrevPage');
    const nextBtn = document.getElementById('NextPage');
    const firstBtn = document.getElementById('GoToFirst');
    const lastBtn = document.getElementById('GoToLast');
    const pageIndicator = document.getElementById('PageIndicator');
    const printerBtn = document.getElementById('Printer'); // دکمه پرینت
    
    // ------ متغیرهای وضعیت ------
    let pdfDoc = null;
    let curPage = 1;
    let tPage = 0;
    let scale = 1.5;
    let Rendering = false;
    let RenderTask = null;
    let currentPageData = null; // برای ذخیره داده‌های صفحه فعلی
    
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
    
    // ------ تابع پرینت ------
    function printCurrentPage() {
        if (!pdfDoc || !currentPageData) {
            setStatus('❌ هیچ صفحه‌ای برای پرینت وجود ندارد', '');
            return;
        }
    
        try {
            // ایجاد یک canvas موقت برای پرینت با کیفیت بالا
            const printCanvas = document.createElement('canvas');
            const printCtx = printCanvas.getContext('2d');
            
            // استفاده از ابعاد اصلی صفحه برای کیفیت بهتر پرینت
            const viewport = currentPageData.getViewport({ scale: 2.0 }); // مقیاس بالاتر برای کیفیت بهتر
            printCanvas.width = viewport.width;
            printCanvas.height = viewport.height;
            
            // رندر کردن صفحه روی canvas موقت با کیفیت بالا
            const printRenderTask = currentPageData.render({
                canvasContext: printCtx,
                viewport: viewport,
                background: 'white',
                enableWebGL: false,
                fontCache: 'LocalFontCache',
                useSystemFonts: true,
                disableFontFace: false,
                buildPath: true,
                renderInteractiveForms: false,
                transform: [1, 0, 0, 1, 0, 0]
            });
    
            printRenderTask.promise.then(() => {
                // تبدیل canvas به تصویر برای پرینت
                const imgData = printCanvas.toDataURL('image/png');
                
                // ایجاد پنجره جدید برای پرینت
                const printWindow = window.open('', '_blank', 'width=800,height=600');
                if (!printWindow) {
                    setStatus('❌ پنجره پرینت بسته شد. لطفاً pop-up را مجاز کنید', '');
                    return;
                }
                
                // محتوای HTML برای پرینت
                printWindow.document.write(`
                    <!DOCTYPE html>
                    <html dir="rtl">
                    <head>
                        <title>پرینت صفحه ${curPage} از ${tPage}</title>
                        <style>
                            body {
                                margin: 0;
                                padding: 20px;
                                display: flex;
                                justify-content: center;
                                align-items: center;
                                min-height: 100vh;
                                background: white;
                                direction: rtl;
                            }
                            .print-container {
                                max-width: 100%;
                                max-height: 100vh;
                                text-align: center;
                            }
                            .print-container img {
                                max-width: 100%;
                                max-height: 90vh;
                                object-fit: contain;
                                border: 1px solid #ddd;
                                box-shadow: 0 0 10px rgba(0,0,0,0.1);
                            }
                            .print-info {
                                margin-top: 10px;
                                font-family: Tahoma, Arial, sans-serif;
                                color: #333;
                                font-size: 14px;
                            }
                            @media print {
                                body { padding: 0; }
                                .print-container img { 
                                    max-height: 100vh; 
                                    border: none;
                                    box-shadow: none;
                                }
                                .print-info { display: none; }
                            }
                        </style>
                    </head>
                    <body>
                        <div class="print-container">
                            <img src="${imgData}" alt="صفحه ${curPage}" />
                            <div class="print-info">
                                صفحه ${curPage} از ${tPage} - ${document.getElementById('FileName')?.textContent || 'PDF'}
                            </div>
                        </div>
                        <script>
                            // اجرای پرینت بعد از بارگذاری کامل تصویر
                            window.onload = function() {
                                setTimeout(function() {
                                    window.print();
                                }, 500);
                            };
                        <\/script>
                    </body>
                    </html>
                `);
                
                printWindow.document.close();
                setStatus(`✅ در حال پرینت صفحه ${curPage}`, 'success');
                
            }).catch(err => {
                console.error('Error in print rendering:', err);
                setStatus('❌ خطا در رندرینگ برای پرینت', '');
            });
            
        } catch (error) {
            console.error('Print error:', error);
            setStatus('❌ خطا در فرآیند پرینت', '');
        }
    }
    
    // ------ تابع اصلی برای رندر ------
    function renderPageWithFixedText(pageNumber) {
        if (!pdfDoc) { plct.style.display = 'block'; canvas.style.display = 'none'; return; }
        if (RenderTask) { RenderTask.cancel(); RenderTask = null; }
        plct.style.display = 'block'; plct.textContent = '⏳ Loading...'; canvas.style.display = 'none';
        Rendering = true; setStatus('Rendering...', 'loading');
        
        pdfDoc.getPage(pageNumber).then(P => {
            // ذخیره داده‌های صفحه برای پرینت
            currentPageData = P;
            
            const cX = canvas.parentElement.clientWidth - 40;
            const viewport = P.getViewport({ scale: 1 });
            const Xscale = cX / viewport.width;
            const optiScale = Math.min(Xscale, 2.0);
            scale = Math.max(optiScale, 0.6);
            const scaledViewport = P.getViewport({ scale: scale });
            canvas.width = scaledViewport.width;
            canvas.height = scaledViewport.height;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
                
            const RenCt = {
                canvasContext:ctx, viewport:scaledViewport, background:'white', enableWebGL:false, 
                fontCache:'LocalFontCache', useSystemFonts:true, disableFontFace:false,
                buildPath: true,
                renderInteractiveForms: false,
                transform: [1, 0, 0, 1, 0, 0]
            };
    
            RenderTask = P.render(RenCt); return RenderTask.promise;
        }).then(()=>{
            Rendering = false; RenderTask = null; 
            canvas.style.display = 'block'; 
            plct.style.display = 'none';
            setStatus('✅ صفحه نمایش داده شد', 'success'); 
            updateButtons();
            fixTextSpacingOnCanvas();
                
        }).catch(err=>{
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
        try {
            canvas.style.imageRendering = 'auto';
            canvas.style.letterSpacing = 'normal';
            canvas.style.wordSpacing = 'normal';
        } catch(e) { null }
    }
    
    // ------ بارگذاری فایل PDF ------
    function loadPDF(F) {
        if (pdfDoc) { pdfDoc.destroy(); pdfDoc = null; }
        if (RenderTask) { RenderTask.cancel(); RenderTask = null; }
        currentPageData = null; // پاک کردن داده‌های صفحه قبلی
    
        const reader = new FileReader();
        reader.onload = function(e) {
            const Arraybuff = e.target.result;
            setStatus('Proccessing...', 'loading');
            plct.style.display = 'block'; plct.textContent = '⏳ Opening the book...';
            canvas.style.display = 'none';
    
            const loadingTask = pdfjsLib.getDocument({
                data:Arraybuff, useSystemFonts:true, disableFontFace:false, verbosity:0, rangeChunkSize: 65536,
                standardFontDataUrl:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/standard_fonts/',
                fontExtraProperties:true,
                isEvalSupported:true,
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
                pdfDoc = null; tPage = 0; currentPageData = null;
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
    
    // اضافه کردن رویداد پرینت به دکمه
    if (printerBtn) {
        printerBtn.addEventListener('click', printCurrentPage);
    }
    
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