const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const { searchParams } = new URL(req.url);
  const setNum = searchParams.get('set_num') ?? '';

  if (!setNum || !/^\d{3,6}(-\d+)?$/.test(setNum)) {
    return new Response(JSON.stringify({ error: 'set_num required and must be a valid LEGO set number' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Strip variant suffix: "10305-1" → "10305"
  const legoNum = setNum.replace(/-\d+$/, '');
  const legoUrl = `https://www.lego.com/en-us/service/building-instructions/${legoNum}`;

  let booklets: { title: string; url: string }[] = [];

  try {
    const res = await fetch(legoUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AntiKragle/1.0)' },
    });

    if (res.ok) {
      const html = await res.text();
      const seen = new Set<string>();
      const pdfPattern =
        /https:\/\/www\.lego\.com\/cdn\/product-assets\/product\.bi\.core\.pdf\/[^"'\s]+\.pdf/g;

      for (const match of html.matchAll(new RegExp(pdfPattern))) {
        seen.add(match[0]);
      }

      const urls = [...seen];
      booklets = urls.map((url, i) => ({
        title: urls.length > 1 ? `Part ${i + 1} of ${urls.length}` : 'Building Instructions',
        url,
      }));
    }
  } catch {
    // Return empty booklets — legoUrl is the fallback
  }

  return new Response(JSON.stringify({ booklets, legoUrl }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
