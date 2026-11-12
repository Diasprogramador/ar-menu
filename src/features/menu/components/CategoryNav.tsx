import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useMenu } from '../MenuContext';

export function CategoryNav({ active }: { active?: string }) {
  const { restaurant, categories } = useMenu();
  const base = `/r/${restaurant.slug}`;
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    const container = nav.current;
    const selected = container?.querySelector<HTMLElement>('[aria-current]');
    if (container && selected) {
      const tab = selected.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      if (tab.left < viewport.left || tab.right > viewport.right) {
        container.scrollLeft += tab.left - viewport.left;
      }
    }
  }, [active]);
  return (
    <nav ref={nav} className="dining-nav" aria-label="Categorias">
      <Link to={base} aria-current={active ? undefined : 'page'}>Todos</Link>
      {categories.map((category) => (
        <Link key={category.id} to={`${base}/categoria/${category.slug}`} aria-current={category.slug === active ? 'page' : undefined}>
          {category.name}
        </Link>
      ))}
    </nav>
  );
}
