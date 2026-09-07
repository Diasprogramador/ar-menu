import { useEffect } from 'react';

/**
 * Metadados por rota.
 *
 * A aplicação é uma SPA, então isto não substitui renderização no servidor para
 * indexação. O que resolve bem: o título da aba, o compartilhamento por link
 * (WhatsApp e redes leem Open Graph ao raspar a página) e manter o painel
 * administrativo fora dos índices.
 */

type SeoOptions = {
  title: string;
  description?: string;
  image?: string | null;
  canonicalPath?: string;
  noIndex?: boolean;
  /** JSON-LD já montado. Só passe dados verdadeiros: schema falso é penalizado. */
  structuredData?: Record<string, unknown> | null;
};

function upsertMeta(selector: string, attribute: 'name' | 'property', key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

export function useSeo({
  title,
  description,
  image,
  canonicalPath,
  noIndex,
  structuredData,
}: SeoOptions): void {
  useEffect(() => {
    document.title = title;

    if (description) {
      upsertMeta('meta[name="description"]', 'name', 'description', description);
      upsertMeta('meta[property="og:description"]', 'property', 'og:description', description);
    }
    upsertMeta('meta[property="og:title"]', 'property', 'og:title', title);
    if (image) {
      upsertMeta('meta[property="og:image"]', 'property', 'og:image', image);
    }

    upsertMeta(
      'meta[name="robots"]',
      'name',
      'robots',
      noIndex ? 'noindex, nofollow' : 'index, follow',
    );

    const href = `${window.location.origin}${canonicalPath ?? window.location.pathname}`;
    upsertMeta('meta[property="og:url"]', 'property', 'og:url', href);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = href;

    const scriptId = 'ar-menu-structured-data';
    document.getElementById(scriptId)?.remove();
    if (structuredData) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }

    return () => {
      document.getElementById(scriptId)?.remove();
    };
  }, [title, description, image, canonicalPath, noIndex, structuredData]);
}
