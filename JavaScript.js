    (function() {
        // ------ تنظیمات اولیه PDF.js ------
        const pdfjsLib = window.pdfjsLib;
        // تنظیم worker (برای نسخه‌های جدیدتر)
        if (pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
        }

        // ------ عناصر DOM ------
        const fileInput = document.getElementById('fileInput');
        const fileNameSpan = document.getElementById('fileName');
        const statusBadge = document.getElementById('statusBadge');

        const canvas = document.getElementById('pdfCanvas');
        const ctx = canvas.getContext('2d');
        const placeholder = document.getElementById('placeholder');

        const prevBtn = document.getElementById('prevPage');
        const nextBtn = document.getElementById('nextPage');
        const firstBtn = document.getElementById('goToFirst');
        const lastBtn = document.getElementById('goToLast');
        const pageIndicator = document.getElementById('pageIndicator');

        // ------ متغیرهای وضعیت ------
        let pdfDoc = null;          // سند PDF
        let currentPage = 1;        // شماره صفحه جاری (۱-ایندکس)
        let totalPages = 0;
        let scale = 1.5;           // مقیاس رندر (با توجه به عرض صفحه تنظیم می‌شود)
        let isRendering = false;
        let renderTask = null;     // برای لغو رندر در صورت نیاز

        // ------ توابع کمکی برای وضعیت ------
        function setStatus(text, type = '') {
            statusBadge.textContent = text;
            statusBadge.className = 'status-badge' + (type ? ' ' + type : '');
        }

        function updateButtons() {
            if (!pdfDoc || totalPages === 0) {
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                firstBtn.disabled = true;
                lastBtn.disabled = true;
                pageIndicator.textContent = 'صفحه ۰ از ۰';
                return;
            }
            prevBtn.disabled = (currentPage <= 1);
            nextBtn.disabled = (currentPage >= totalPages);
            firstBtn.disabled = (currentPage <= 1);
            lastBtn.disabled = (currentPage >= totalPages);
            pageIndicator.textContent = `صفحه ${currentPage} از ${totalPages}`;
        }

        // ------ تابع رندر صفحه با بهینه‌سازی (لغو رندر قبلی در صورت نیاز) ------
        function renderPage(pageNumber) {
            if (!pdfDoc) {
                placeholder.style.display = 'block';
                canvas.style.display = 'none';
                return;
            }

            // اگر در حال رندر هستیم، آن را لغو می‌کنیم تا سرعت بهبود یابد
            if (renderTask) {
                renderTask.cancel();
                renderTask = null;
            }

            // نمایش placeholder در حین بارگذاری
            placeholder.style.display = 'block';
            placeholder.textContent = '⏳ در حال بارگذاری صفحه...';
            canvas.style.display = 'none';

            isRendering = true;
            setStatus('در حال رندر...', 'loading');

            // گرفتن صفحه مورد نظر
            pdfDoc.getPage(pageNumber).then(page => {
                // محاسبه مقیاس بر اساس عرض canvas (متناسب با نمایشگر)
                const containerWidth = canvas.parentElement.clientWidth - 40; // padding
                const viewport = page.getViewport({ scale: 1 });
                const widthScale = containerWidth / viewport.width;
                // محدود کردن مقیاس برای جلوگیری از رندر بیش از حد بزرگ (بهینه‌سازی)
                const optimalScale = Math.min(widthScale, 2.0); // حداکثر 2x برای کیفیت
                scale = Math.max(optimalScale, 0.6); // حداقل مقیاس

                const scaledViewport = page.getViewport({ scale: scale });
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;

                // گزینه‌های رندر با کیفیت و بهینه
                const renderContext = {
                    canvasContext: ctx,
                    viewport: scaledViewport,
                    // برای سرعت بیشتر و حافظه کمتر در کتاب‌های بزرگ
                    background: 'white',
                    enableWebGL: false, // WebGL ممکن است در برخی مرورگرها مشکل داشته باشد
                };

                // شروع رندر
                renderTask = page.render(renderContext);
                return renderTask.promise;
            }).then(() => {
                // رندر با موفقیت انجام شد
                isRendering = false;
                renderTask = null;
                canvas.style.display = 'block';
                placeholder.style.display = 'none';
                setStatus('✅ صفحه نمایش داده شد', 'success');
                updateButtons();
            }).catch(err => {
                // اگر خطا مربوط به لغو شدن باشد، نادیده گرفته می‌شود
                if (err && err.name === 'RenderingCancelledException') {
                    console.log('رندر قبلی لغو شد (بهینه)');
                    // حالت placeholder را به روز نمی‌کنیم چون رندر جدید در راه است
                    return;
                }
                console.error('خطا در رندر صفحه:', err);
                isRendering = false;
                renderTask = null;
                setStatus('❌ خطا در نمایش صفحه', '');
                placeholder.style.display = 'block';
                placeholder.textContent = '⚠️ خطا در بارگذاری صفحه. ممکن است فایل خراب باشد.';
                canvas.style.display = 'none';
                updateButtons();
            });
        }

        // ------ تغییر صفحه با بررسی و بهینه‌سازی ------
        function goToPage(pageNum) {
            if (!pdfDoc) return;
            if (pageNum < 1) pageNum = 1;
            if (pageNum > totalPages) pageNum = totalPages;
            if (pageNum === currentPage && pdfDoc) {
                // اگر همان صفحه است، اما ممکن است canvas خالی باشد (مثلاً بعد از خطا) دوباره رندر می‌کنیم
                if (canvas.style.display === 'none') {
                    renderPage(pageNum);
                }
                return;
            }
            currentPage = pageNum;
            renderPage(currentPage);
        }

        // ------ بارگذاری فایل PDF (با بهینه‌سازی برای کتاب‌های بزرگ) ------
        function loadPDF(file) {
            // اگر فایل قبلی وجود دارد، حافظه را آزاد می‌کنیم
            if (pdfDoc) {
                pdfDoc.destroy();
                pdfDoc = null;
            }
            if (renderTask) {
                renderTask.cancel();
                renderTask = null;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                setStatus('در حال پردازش...', 'loading');
                placeholder.style.display = 'block';
                placeholder.textContent = '⏳ در حال باز کردن کتاب...';
                canvas.style.display = 'none';

                // بارگذاری با گزینه‌های بهینه (استفاده از حافظه کمتر)
                const loadingTask = pdfjsLib.getDocument({
                    data: arrayBuffer,
                    // گزینه‌های بهینه‌سازی برای کتاب‌های بزرگ
                    useSystemFonts: true,    // استفاده از فونت‌های سیستم برای سرعت
                    disableFontFace: false,   // برای نمایش بهتر
                    verbosity: 0,
                    rangeChunkSize: 65536,    // خواندن تکه‌تکه
                });

                loadingTask.promise.then(function(doc) {
                    pdfDoc = doc;
                    totalPages = doc.numPages;
                    currentPage = 1;

                    // بروزرسانی UI
                    fileNameSpan.textContent = file.name + ` (${totalPages} صفحه)`;
                    setStatus(`✅ ${totalPages} صفحه`, 'success');
                    placeholder.textContent = '📖 کتاب باز شد، صفحه اول در حال بارگذاری...';
                    
                    // فعال کردن دکمه‌ها
                    updateButtons();
                    
                    // رندر صفحه اول
                    renderPage(1);
                }).catch(err => {
                    console.error('خطا در باز کردن PDF:', err);
                    setStatus('❌ خطا در باز کردن فایل', '');
                    placeholder.style.display = 'block';
                    placeholder.textContent = '⚠️ فایل معتبر نیست یا خراب است.';
                    canvas.style.display = 'none';
                    pdfDoc = null;
                    totalPages = 0;
                    updateButtons();
                    fileNameSpan.textContent = '❌ فایل نامعتبر';
                });
            };

            reader.onerror = function() {
                setStatus('❌ خطا در خواندن فایل', '');
                placeholder.textContent = '⚠️ خطا در خواندن فایل از دستگاه';
            };

            reader.readAsArrayBuffer(file);
        }

        // ------ رویدادهای کنترل ------
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            // بررسی پسوند (ساده)
            if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                setStatus('❌ لطفا فایل PDF انتخاب کنید', '');
                fileNameSpan.textContent = '⚠️ فرمت پشتیبانی نمی‌شود';
                return;
            }
            loadPDF(file);
            // ریست اینپوت تا امکان انتخاب مجدد همان فایل وجود داشته باشد
            fileInput.value = '';
        });

        // دکمه‌های ناوبری
        prevBtn.addEventListener('click', function() {
            if (pdfDoc && currentPage > 1) {
                goToPage(currentPage - 1);
            }
        });

        nextBtn.addEventListener('click', function() {
            if (pdfDoc && currentPage < totalPages) {
                goToPage(currentPage + 1);
            }
        });

        firstBtn.addEventListener('click', function() {
            if (pdfDoc) {
                goToPage(1);
            }
        });

        lastBtn.addEventListener('click', function() {
            if (pdfDoc) {
                goToPage(totalPages);
            }
        });

        // ------ بهینه‌سازی برای تغییر اندازه پنجره (با تاخیر) ------
        let resizeTimer = null;
        window.addEventListener('resize', function() {
            if (pdfDoc) {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    // اگر صفحه فعلی در حال نمایش است، دوباره رندر می‌شود
                    if (pdfDoc && currentPage >= 1 && currentPage <= totalPages) {
                        renderPage(currentPage);
                    }
                }, 300);
            }
        });

        // ------ شروع: وضعیت اولیه ------
        setStatus('⏳ آماده', '');
        updateButtons();
        placeholder.style.display = 'block';
        canvas.style.display = 'none';
        fileNameSpan.textContent = 'هیچ فایلی انتخاب نشده';

        // (اختیاری) برای رفع مشکل display در مرورگرهای خاص
        console.log('📘 کتابخوان PDF بهینه بارگذاری شد.');
    })();