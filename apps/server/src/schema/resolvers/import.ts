import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { GraphQLError } from "graphql";
import type { GraphQLContext } from "../../context.js";
import { requireAdmin } from "../../utils/access.js";
import { pubsub } from "../../pubsub.js";
import { UPLOADS_DIR } from "../../upload.js";
import { gridPosition, type ImportIssue } from "../../lib/holobuilderImport.js";
import { consumeImportJob, cleanupImportJob } from "../../lib/importJobs.js";

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/** Copia un file estratto in /uploads con nome uuid, ritorna l'URL pubblico. */
function copyToUploads(srcAbs: string): string {
  const ext = (path.extname(srcAbs) || ".jpg").toLowerCase();
  const name = `${randomUUID()}${ext}`;
  fs.copyFileSync(srcAbs, path.join(UPLOADS_DIR, name));
  return `/uploads/${name}`;
}

export const importResolvers = {
  Mutation: {
    confermaImportHolobuilder: async (
      _parent: unknown,
      args: {
        jobId: string;
        nome: string;
        indirizzo: string;
        skipFotoSenzaData?: boolean | null;
      },
      ctx: GraphQLContext
    ) => {
      const user = requireAdmin(ctx);
      if (!args.nome.trim() || !args.indirizzo.trim()) {
        throw new GraphQLError("Nome e indirizzo sono obbligatori", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }

      const job = consumeImportJob(args.jobId);
      if (!job) {
        throw new GraphQLError("Sessione di import non trovata o scaduta. Ricarica lo ZIP.", {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      const { structure, tempDir } = job;
      const totali = structure.totaleFoto;
      const issues: ImportIssue[] = [...structure.issues];
      let avvisiCount = issues.filter((i) => i.severita === "warning").length;
      let erroriCount = 0;
      let piantineCreate = 0;
      let puntiCreati = 0;
      let fotoCreate = 0;

      const topic = `IMPORT_PROGRESS_${args.jobId}`;
      const publish = (fase: string, correnti: number, messaggio: string) =>
        pubsub.publish(topic, {
          importProgress: {
            fase,
            correnti,
            totali,
            messaggio,
            avvisiCount,
            erroriCount,
            completato: false,
            errore: null,
            cantiereId: null,
          },
        });

      const cantiere = await ctx.prisma.cantiere.create({
        data: { nome: args.nome.trim(), indirizzo: args.indirizzo.trim() },
      });

      try {
        for (const floor of structure.floors) {
          const planUrl = copyToUploads(path.join(tempDir, floor.floorPlanRel!));
          const piantina = await ctx.prisma.piantina.create({
            data: {
              cantiereId: cantiere.id,
              nome: floor.name,
              livello: floor.livello,
              fileUrl: planUrl,
              larghezza: 1000, // placeholder: i marker usano coordinate % (0–100)
              altezza: 1000,
            },
          });
          piantineCreate++;
          await publish("piantine", fotoCreate, `Piano "${floor.name}"`);

          const totPunti = floor.points.length;
          for (let pi = 0; pi < floor.points.length; pi++) {
            const point = floor.points[pi];
            const { x, y } = gridPosition(pi, totPunti);
            const punto = await ctx.prisma.puntoDiScatto.create({
              data: { piantinaId: piantina.id, nome: point.name, x, y },
            });
            puntiCreati++;

            for (const photo of point.photos) {
              if (!photo.timestamp && args.skipFotoSenzaData) {
                continue; // già segnalata come avviso dataMancante
              }
              try {
                const url = copyToUploads(path.join(tempDir, photo.rel));
                await ctx.prisma.foto360.create({
                  data: {
                    puntoDiScattoId: punto.id,
                    url,
                    uploadedById: user.userId,
                    metadata: {
                      source: "holobuilder-import",
                      originalName: photo.originalName,
                    },
                    ...(photo.timestamp ? { timestamp: photo.timestamp } : {}),
                  },
                });
                fotoCreate++;
              } catch (e) {
                erroriCount++;
                issues.push({
                  severita: "error",
                  categoria: "scritturaFallita",
                  percorso: photo.rel,
                  messaggio: `Errore salvataggio foto: ${e instanceof Error ? e.message : String(e)}`,
                  azione: "saltata",
                });
              }
              await publish("foto", fotoCreate, `Foto ${fotoCreate}/${totali}`);
            }
          }
        }

        await pubsub.publish(topic, {
          importProgress: {
            fase: "completato",
            correnti: fotoCreate,
            totali,
            messaggio: "Import completato",
            avvisiCount,
            erroriCount,
            completato: true,
            errore: null,
            cantiereId: cantiere.id,
          },
        });

        const stato =
          erroriCount > 0 || avvisiCount > 0 ? "completatoConAvvisi" : "completato";
        return {
          stato,
          cantiereId: cantiere.id,
          piantineCreate,
          puntiCreati,
          fotoCreate,
          issues,
        };
      } catch (fatal) {
        // Rollback: elimina il cantiere creato (cascade → piantine/punti/foto).
        try {
          await ctx.prisma.cantiere.delete({ where: { id: cantiere.id } });
        } catch {
          /* best-effort */
        }
        const msg = fatal instanceof Error ? fatal.message : String(fatal);
        await pubsub.publish(topic, {
          importProgress: {
            fase: "errore",
            correnti: fotoCreate,
            totali,
            messaggio: "Import fallito",
            avvisiCount,
            erroriCount,
            completato: true,
            errore: msg,
            cantiereId: null,
          },
        });
        throw new GraphQLError(`Import fallito: ${msg}`, {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      } finally {
        cleanupImportJob(tempDir);
      }
    },
  },

  Subscription: {
    importProgress: {
      subscribe: (_parent: unknown, args: { jobId: string }) => {
        return pubsub.asyncIterator([`IMPORT_PROGRESS_${args.jobId}`]);
      },
    },
  },
};
