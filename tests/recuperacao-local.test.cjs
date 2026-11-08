const test = require('node:test');
const assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
const { preparar, paciente, outro, usuario } = require('./paciente-unificado-fixture.cjs');
const { adapter } = require('./estoque-local-db.cjs');
const { criarServico, BUCKET } = require('../services/documentos');

test('restaura o banco e a cópia separada do PDF na ficha correta', async () => {
    const origem = await preparar();
    const caminho = paciente + '/' + origem.doc + '.pdf';
    const backupPdf = new Blob([origem.pdf]);
    let backupBanco;
    try {
        backupBanco = await origem.pg.dumpDataDir();
    } finally {
        await origem.pg.close();
    }

    const destino = await PGlite.create({ loadDataDir: backupBanco });
    try {
        await destino.exec('set role service_role');
        const banco = adapter(destino);
        let copiaRestaurada;
        banco.storage = {
            from(bucket) {
                assert.equal(bucket, BUCKET);
                return {
                    async download(chave) {
                        assert.equal(chave, caminho);
                        return { data: copiaRestaurada };
                    }
                };
            }
        };
        const documentos = criarServico(banco, {});
        const operador = { id: usuario };
        const itens = await documentos.listar(paciente, operador);
        assert.equal(itens[0].id, origem.doc);
        assert.deepEqual(await documentos.listar(outro, operador), []);
        await assert.rejects(documentos.baixar(paciente, origem.doc, operador), { statusCode: 503 });
        copiaRestaurada = backupPdf;
        const pdf = await documentos.baixar(paciente, origem.doc, operador);
        assert.deepEqual(pdf.buffer, origem.pdf);
        assert.equal(pdf.sha256, origem.sha);
        await assert.rejects(documentos.baixar(outro, origem.doc, operador), { statusCode: 404 });
        const { rows: [registros] } = await destino.query(`
            select
              (select count(*)::int from agendamentos where visitante_id=$1) as agenda,
              (select count(*)::int from lancamentos_financeiros where visitante_id=$1) as financeiro,
              (select count(*)::int from estoque_atendimentos where paciente_id=$1) as materiais
        `, [paciente]);
        assert.deepEqual(registros, { agenda: 1, financeiro: 1, materiais: 1 });
    } finally {
        await destino.close();
    }
});
