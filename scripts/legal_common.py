"""Utilidades compartidas para generar páginas legales estáticas."""


def render_block(block):
    kind = block[0]
    if kind == "p":
        return f"        <p>{block[1]}</p>\n"
    if kind == "html":
        return f"        <p>{block[1]}</p>\n"
    if kind == "h3":
        return f'        <h3 class="legal-h3">{block[1]}</h3>\n'
    if kind == "ul":
        items = "".join(f"          <li>{item}</li>\n" for item in block[1])
        return f"        <ul>\n{items}        </ul>\n"
    if kind == "contact":
        rows = []
        for label, value, href in block[1]:
            if href:
                rows.append(
                    f'          <dt>{label}</dt><dd><a href="{href}">{value}</a></dd>'
                )
            else:
                rows.append(f"          <dt>{label}</dt><dd>{value}</dd>")
        return '        <dl class="legal-contact-list">\n' + "\n".join(rows) + "\n        </dl>\n"
    return ""


def render_sections(sections):
    parts = []
    for title, blocks in sections:
        body = "".join(render_block(b) for b in blocks)
        section_id = title.split(".")[0].strip().replace(" ", "-")
        parts.append(
            f'      <section class="legal-section" id="sec-{section_id}">\n'
            f"        <h2>{title}</h2>\n{body}"
            f"      </section>\n"
        )
    return "".join(parts)


def render_content_fragment(sections, build_script_name):
    return f"""<!-- Editar en scripts/{build_script_name} (SECTIONS) y ejecutar el script -->
<div class="legal-sections">
{render_sections(sections)}  <div class="legal-actions">
    <a href="../" class="legal-btn-back">Volver al inicio</a>
  </div>
</div>
"""
