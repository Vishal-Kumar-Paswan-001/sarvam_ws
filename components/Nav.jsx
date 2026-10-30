export default function Nav({ active }) {
  const items = [
    ['/share', 'Share'],
    ['/view', 'View'],
    ['/reader', 'Reader'],
    ['/demo', 'Demo'],
  ];
  return (
    <nav className="nav">
      {items.map(([href, label]) => (
        <a
          key={href}
          href={href}
          className={active === label.toLowerCase() ? 'active' : ''}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
