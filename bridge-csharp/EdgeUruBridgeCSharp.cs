#nullable enable
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

// Usa los tipos del wrapper: NativeLoader, Dp4500Service, FingerprintTempStore, etc.

namespace EdgeBridge
{
    public class EdgeUruBridge
    {
        private static Dp4500Service? _svc;
        private static CancellationTokenSource? _cts;
        private static Func<object, Task<object>>? _jsCb;

        public async Task<object> Invoke(dynamic input)
        {
            string op = (string?)input?.op ?? "";
            switch (op)
            {
                case "bootstrap":
                {
                    string? extra = (string?)input?.searchPath;
                    try
                    {
                        NativeLoader.Bootstrap(AppDomain.CurrentDomain.BaseDirectory, extra ?? "", @"..\bin-deps");
                        return new { ok = true };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "registerCallback":
                    _jsCb = (Func<object, Task<object>>)input.callback;
                    return new { ok = true };

                case "init":
                {
                    _svc ??= new Dp4500Service();
                    _svc.OnStatus += s => _ = _jsCb?.Invoke(new { evt = "status", msg = s });
                    _svc.OnSampleCountChanged += n => _ = _jsCb?.Invoke(new { evt = "count", n });
                    _svc.OnAttemptResult += (i, ok, why) => _ = _jsCb?.Invoke(new { evt = "attempt", i, ok, why });
                    try { _svc.Init(); return new { ok = true }; }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "single":
                {
                    int timeoutMs = (int?)input?.timeoutMs ?? 10000;
                    _cts?.Cancel(); _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
                    try { _svc!.SingleCapture(_cts.Token); return new { ok = true, msg = "SingleCapture OK" }; }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "identify1N":
                {
                    int timeoutMs = (int?)input?.timeoutMs ?? 12000;
                    int farn = (int?)input?.targetFarn ?? 21474;
                    int top = (int?)input?.top ?? 5;
                    _cts?.Cancel(); _cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(timeoutMs));
                    try
                    {
                        var r = _svc!.IdentifyLive1N(_cts.Token, farn, top);
                        return new { ok = true, r.match, r.bestScore, r.bestTag, r.galleryFormat, r.topK, r.msg };
                    }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                case "storeList":
                {
                    var items = FingerprintTempStore.All()
                        .Select(x => new { x.Tag, x.Format, x.Bytes, x.XmlLength, x.Sha1, Utc = x.Utc })
                        .OrderByDescending(x => x.Utc)
                        .ToArray();
                    return new { ok = true, items };
                }

                case "storeClear":
                    FingerprintTempStore.Clear();
                    return new { ok = true };

                case "dispose":
                {
                    try { _cts?.Cancel(); _cts = null; _svc?.Dispose(); _svc = null; return new { ok = true }; }
                    catch (Exception ex) { return new { ok = false, error = ex.Message }; }
                }

                default:
                    return new { ok = false, error = "UNKNOWN_OP" };
            }
        }
    }
}
