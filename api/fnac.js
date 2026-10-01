export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { id, type } = req.query;
  if (!id) return res.status(400).json({ error: 'Missing id' });

  // Construire l'URL selon le type d'ID
  // ARTIST ID (6 chiffres) → page artiste
  // ESID (7 chiffres) → page spectacle  
  // EVID (8 chiffres) → page événement
  let url;
  if (type === 'artist' || (id.length <= 7 && parseInt(id) < 9999999)) {
    url = `https://www.fnacspectacles.com/artiste/artiste-${id}/`;
  } else {
    url = `https://www.fnacspectacles.com/spectacle/spectacle-${id}/`;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      }
    });

    if (!response.ok) {
      return res.status(404).json({ error: 'Page not found', url });
    }

    const html = await response.text();

    // Extraire les infos clés depuis le HTML
    const result = { id, url, raw: '' };

    // Nom de l'artiste/spectacle
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                       html.match(/<title>([^<|]+)/i);
    if (titleMatch) result.nom = titleMatch[1].trim().replace(/\s*[-|].*$/, '').trim();

    // Catégorie depuis les breadcrumbs ou meta
    const catMatch = html.match(/categorie[^"]*"([^"]+)"/i) ||
                     html.match(/category[^"]*"([^"]+)"/i) ||
                     html.match(/"genre"\s*:\s*"([^"]+)"/i);
    if (catMatch) result.categorie = catMatch[1];

    // Image
    const imgMatch = html.match(/og:image[^>]*content="([^"]+)"/i) ||
                     html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
    if (imgMatch) result.image = imgMatch[1];

    // Description
    const descMatch = html.match(/og:description[^>]*content="([^"]+)"/i) ||
                      html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    if (descMatch) result.description = descMatch[1].trim();

    // Dates d'événements (chercher des patterns de date)
    const dateMatches = html.match(/\d{1,2}\s+(?:janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+\d{4}/gi);
    if (dateMatches) result.dates = [...new Set(dateMatches)].slice(0, 5);

    // Villes
    const villeMatches = html.match(/"addressLocality"\s*:\s*"([^"]+)"/gi);
    if (villeMatches) result.villes = [...new Set(villeMatches.map(v => v.match(/"([^"]+)"$/)[1]))].slice(0, 5);

    // JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/i);
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1]);
        if (jsonLd.name) result.nom = jsonLd.name;
        if (jsonLd.genre) result.categorie = jsonLd.genre;
        if (jsonLd.image) result.image = Array.isArray(jsonLd.image) ? jsonLd.image[0] : jsonLd.image;
        if (jsonLd.description) result.description = jsonLd.description;
        if (jsonLd.performer) result.artiste = Array.isArray(jsonLd.performer) ? jsonLd.performer[0].name : jsonLd.performer.name;
        if (jsonLd.startDate) result.dateDebut = jsonLd.startDate;
        if (jsonLd.location) result.lieu = jsonLd.location.name || jsonLd.location.address?.addressLocality;
      } catch(e) {}
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message, url });
  }
}
