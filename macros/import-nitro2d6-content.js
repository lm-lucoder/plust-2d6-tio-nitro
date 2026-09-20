/**
 * Importador de catálogo +2d6 para Foundry VTT 14.
 *
 * Crie uma Macro do tipo Script, cole este arquivo e execute-a em um mundo
 * que use o sistema +2d6 • Nitro. Cole o conteúdo de nitro2d6-content.json
 * no diálogo. Reexecutar a macro não duplica documentos já importados.
 */

void (async () => {
  const SYSTEM_ID = 'nitro2d6';
  const CATALOG_FORMAT = 'nitro2d6-content-source';
  const DEFAULT_ROOT = '+2d6';
  const BATCH_SIZE = 50;
  const TYPE_LABELS = {Item: 'Itens', Actor: 'Atores', JournalEntry: 'Referências'};

  if (!game.user.isGM) {
    ui.notifications.error('Apenas um Mestre pode importar conteúdo para o mundo.');
    return;
  }
  if (game.system.id !== SYSTEM_ID) {
    ui.notifications.error('Abra um mundo que use o sistema +2d6 • Nitro antes de importar o catálogo.');
    return;
  }

  const escapeHTML = value => foundry.utils.escapeHTML(String(value ?? ''));
  const getParentId = folder => folder?.folder?.id ?? folder?._source?.folder ?? null;

  function validateCatalog(catalog) {
    if (!catalog || catalog.format !== CATALOG_FORMAT || !Array.isArray(catalog.packs)) {
      throw new Error('Este texto não é um catálogo +2d6 válido. Cole o conteúdo completo de nitro2d6-content.json.');
    }
    for (const pack of catalog.packs) {
      if (!pack?.key || !pack?.label || !Array.isArray(pack.documents)) throw new Error('O catálogo possui um pack sem chave, nome ou documentos.');
      if (!TYPE_LABELS[pack.documentName]) throw new Error(`O pack “${pack.label}” usa o tipo de documento não suportado “${pack.documentName}”.`);
      if (pack.documentName !== 'JournalEntry' && !pack.documentType) throw new Error(`O pack “${pack.label}” não informa o tipo de Item ou Actor.`);
    }
    return catalog;
  }

  async function askForCatalog() {
    return foundry.applications.api.DialogV2.wait({
      window: {title: 'Importar conteúdo +2d6'},
      position: {width: 760, height: 650},
      content: `
        <form class="standard-form">
          <p>Cole o conteúdo completo de <strong>nitro2d6-content.json</strong>. A importação cria pastas no mundo e ignora documentos já importados deste catálogo.</p>
          <fieldset>
            <legend>Organização</legend>
            <div class="form-group">
              <label for="nitro-content-root">Nome das pastas-raiz</label>
              <div class="form-fields"><input id="nitro-content-root" name="rootName" type="text" value="${DEFAULT_ROOT}" required></div>
            </div>
          </fieldset>
          <div class="form-group stacked">
            <label for="nitro-content-json">Catálogo JSON</label>
            <textarea id="nitro-content-json" name="json" rows="20" spellcheck="false" required placeholder='{"format":"nitro2d6-content-source", ...}'></textarea>
          </div>
        </form>`,
      buttons: [
        {
          action: 'import', label: 'Importar no mundo', icon: 'fa-solid fa-file-import', default: true,
          callback: (_event, button) => ({
            json: button.form.elements.json.value.trim(),
            rootName: button.form.elements.rootName.value.trim() || DEFAULT_ROOT
          })
        },
        {action: 'cancel', label: 'Cancelar', icon: 'fa-solid fa-xmark', callback: () => false}
      ],
      rejectClose: false
    });
  }

  async function ensureFolder(name, type, parent = null) {
    const parentId = parent?.id ?? null;
    const existing = game.folders.find(folder => folder.type === type && folder.name === name && getParentId(folder) === parentId);
    if (existing) return existing;
    return Folder.create({name, type, folder: parentId, sorting: 'a', color: '#a0462e'});
  }

  function prepareSource(source, folder, catalog, pack) {
    const data = foundry.utils.deepClone(source);
    delete data._id;
    data.folder = folder.id;
    const flags = foundry.utils.deepClone(data.flags ?? {});
    flags[SYSTEM_ID] ??= {};
    flags[SYSTEM_ID].import = {
      catalogFormat: catalog.format,
      catalogVersion: catalog.formatVersion,
      sourceId: source._id,
      packKey: pack.key
    };
    data.flags = flags;
    return data;
  }

  function wasImported(document, source, catalog, pack) {
    if (!document) return false;
    const marker = document.getFlag?.(SYSTEM_ID, 'import') ?? document.flags?.[SYSTEM_ID]?.import;
    return marker?.catalogFormat === catalog.format && marker?.sourceId === source._id && marker?.packKey === pack.key;
  }

  async function createInBatches(DocumentClass, sources, report) {
    for (let index = 0; index < sources.length; index += BATCH_SIZE) {
      const batch = sources.slice(index, index + BATCH_SIZE);
      try {
        await DocumentClass.createDocuments(batch, {render: false});
        report.created += batch.length;
      } catch (batchError) {
        console.warn('+2d6 | Falha ao importar lote; tentando documento por documento.', batchError);
        for (const source of batch) {
          try {
            await DocumentClass.create(source, {render: false});
            report.created += 1;
          } catch (error) {
            report.errors.push({name: source.name, error: error.message});
            console.error(`+2d6 | Não foi possível importar “${source.name}”.`, error);
          }
        }
      }
    }
  }

  const input = await askForCatalog();
  if (!input) return;

  let catalog;
  try {
    catalog = validateCatalog(JSON.parse(input.json));
  } catch (error) {
    ui.notifications.error(error.message);
    return;
  }

  const confirmation = await foundry.applications.api.DialogV2.confirm({
    window: {title: 'Confirmar importação +2d6'},
    content: `<p>Importar <strong>${catalog.packs.reduce((total, pack) => total + pack.documents.length, 0)}</strong> documentos para este mundo?</p>
      <p>As pastas serão criadas sob <strong>${escapeHTML(input.rootName)}</strong>. Documentos já importados deste catálogo serão ignorados.</p>`,
    yes: {label: 'Importar', icon: 'fa-solid fa-file-import'}, no: {label: 'Cancelar'}, rejectClose: false
  });
  if (!confirmation) return;

  const report = {created: 0, skipped: 0, errors: [], folders: 0};
  const roots = new Map();
  const rootFolder = async documentName => {
    if (roots.has(documentName)) return roots.get(documentName);
    const folder = await ensureFolder(`${input.rootName} — ${TYPE_LABELS[documentName]}`, documentName);
    roots.set(documentName, folder);
    return folder;
  };

  try {
    for (const pack of catalog.packs) {
      const DocumentClass = CONFIG[pack.documentName]?.documentClass ?? getDocumentClass(pack.documentName);
      const collection = game.collections.get(pack.documentName);
      if (!DocumentClass || !collection) throw new Error(`O Foundry não disponibilizou ${pack.documentName} para importação.`);

      const parent = await rootFolder(pack.documentName);
      const folder = await ensureFolder(pack.label, pack.documentName, parent);
      report.folders += 1;
      const pending = [];
      for (const source of pack.documents) {
        if (collection.find(document => wasImported(document, source, catalog, pack))) {
          report.skipped += 1;
          continue;
        }
        pending.push(prepareSource(source, folder, catalog, pack));
      }
      await createInBatches(DocumentClass, pending, report);
    }
  } catch (error) {
    console.error('+2d6 | Importação interrompida.', error);
    ui.notifications.error(`Importação interrompida: ${error.message}`);
    return;
  }

  const message = `+2d6: ${report.created} documentos criados, ${report.skipped} já existentes e ${report.errors.length} com erro.`;
  console.groupCollapsed('+2d6 | Relatório de importação');
  console.log(message);
  if (report.errors.length) console.table(report.errors);
  console.groupEnd();
  if (report.errors.length) ui.notifications.warn(`${message} Consulte o console (F12) para os detalhes.`);
  else ui.notifications.info(message);
})();
