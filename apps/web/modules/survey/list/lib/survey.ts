import "server-only";
import { checkForInvalidImagesInQuestions } from "@/lib/survey/utils";
import { validateInputs } from "@/lib/utils/validate";
import { buildOrderByClause, buildWhereClause } from "@/modules/survey/lib/utils";
import { doesEnvironmentExist } from "@/modules/survey/list/lib/environment";
import { getProjectWithLanguagesByEnvironmentId } from "@/modules/survey/list/lib/project";
import { TProjectWithLanguages, TSurvey } from "@/modules/survey/list/types/surveys";
import { createId } from "@paralleldrive/cuid2";
import { Prisma } from "@prisma/client";
import { cache as reactCache } from "react";
import { z } from "zod";
import { prisma } from "@formbricks/database";
import { logger } from "@formbricks/logger";
import { DatabaseError, ResourceNotFoundError } from "@formbricks/types/errors";
import { TSurveyFilterCriteria } from "@formbricks/types/surveys/types";

export const surveySelect: Prisma.SurveySelect = {
  id: true,
  createdAt: true,
  updatedAt: true,
  name: true,
  type: true,
  creator: {
    select: {
      name: true,
    },
  },
  status: true,
  singleUse: true,
  environmentId: true,
  _count: {
    select: { responses: true },
  },
};

export const getSurveys = reactCache(
  async (
    environmentId: string,
    limit?: number,
    offset?: number,
    filterCriteria?: TSurveyFilterCriteria
  ): Promise<TSurvey[]> => {
    try {
      if (filterCriteria?.sortBy === "relevance") {
        // Call the sortByRelevance function
        return await getSurveysSortedByRelevance(environmentId, limit, offset ?? 0, filterCriteria);
      }

      // Fetch surveys normally with pagination and include response count
      const surveysPrisma = await prisma.survey.findMany({
        where: {
          environmentId,
          ...buildWhereClause(filterCriteria),
        },
        select: surveySelect,
        orderBy: buildOrderByClause(filterCriteria?.sortBy),
        take: limit,
        skip: offset,
      });

      return surveysPrisma.map((survey) => {
        return {
          ...survey,
          responseCount: survey._count.responses,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        logger.error(error, "Error getting surveys");
        throw new DatabaseError(error.message);
      }
      throw error;
    }
  }
);

export const getSurveysSortedByRelevance = reactCache(
  async (
    environmentId: string,
    limit?: number,
    offset?: number,
    filterCriteria?: TSurveyFilterCriteria
  ): Promise<TSurvey[]> => {
    try {
      let surveys: TSurvey[] = [];

      const inProgressSurveyCount = await prisma.survey.count({
        where: {
          environmentId,
          status: "inProgress",
          ...buildWhereClause(filterCriteria),
        },
      });

      // Fetch surveys that are in progress first
      const inProgressSurveys =
        offset && offset > inProgressSurveyCount
          ? []
          : await prisma.survey.findMany({
              where: {
                environmentId,
                status: "inProgress",
                ...buildWhereClause(filterCriteria),
              },
              select: surveySelect,
              orderBy: buildOrderByClause("updatedAt"),
              take: limit,
              skip: offset,
            });

      surveys = inProgressSurveys.map((survey) => {
        return {
          ...survey,
          responseCount: survey._count.responses,
        };
      });

      // Determine if additional surveys are needed
      if (offset !== undefined && limit && inProgressSurveys.length < limit) {
        const remainingLimit = limit - inProgressSurveys.length;
        const newOffset = Math.max(0, offset - inProgressSurveyCount);
        const additionalSurveys = await prisma.survey.findMany({
          where: {
            environmentId,
            status: { not: "inProgress" },
            ...buildWhereClause(filterCriteria),
          },
          select: surveySelect,
          orderBy: buildOrderByClause("updatedAt"),
          take: remainingLimit,
          skip: newOffset,
        });

        surveys = [
          ...surveys,
          ...additionalSurveys.map((survey) => {
            return {
              ...survey,
              responseCount: survey._count.responses,
            };
          }),
        ];
      }

      return surveys;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        logger.error(error, "Error getting surveys sorted by relevance");
        throw new DatabaseError(error.message);
      }
      throw error;
    }
  }
);

export const getSurvey = reactCache(async (surveyId: string): Promise<TSurvey | null> => {
  let surveyPrisma;
  try {
    surveyPrisma = await prisma.survey.findUnique({
      where: {
        id: surveyId,
      },
      select: surveySelect,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error(error, "Error getting survey");
      throw new DatabaseError(error.message);
    }
    throw error;
  }

  if (!surveyPrisma) {
    return null;
  }

  return { ...surveyPrisma, responseCount: surveyPrisma?._count.responses };
});

export const deleteSurvey = async (surveyId: string): Promise<boolean> => {
  try {
    const deletedSurvey = await prisma.survey.delete({
      where: {
        id: surveyId,
      },
      select: {
        id: true,
        environmentId: true,
        segment: {
          select: {
            id: true,
            isPrivate: true,
          },
        },
        type: true,
        triggers: {
          select: {
            actionClass: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (deletedSurvey.type === "app" && deletedSurvey.segment?.isPrivate) {
      await prisma.segment.delete({
        where: {
          id: deletedSurvey.segment.id,
        },
      });
    }

    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error(error, "Error deleting survey");
      throw new DatabaseError(error.message);
    }

    throw error;
  }
};

const getExistingSurvey = async (surveyId: string) => {
  return await prisma.survey.findUnique({
    where: {
      id: surveyId,
    },
    select: {
      name: true,
      type: true,
      languages: {
        select: {
          default: true,
          enabled: true,
          language: {
            select: {
              code: true,
              alias: true,
            },
          },
        },
      },
      welcomeCard: true,
      questions: true,
      endings: true,
      variables: true,
      hiddenFields: true,
      surveyClosedMessage: true,
      singleUse: true,
      projectOverwrites: true,
      styling: true,
      segment: true,
      followUps: true,
      triggers: {
        select: {
          actionClass: {
            select: {
              id: true,
              name: true,
              environmentId: true,
              description: true,
              type: true,
              key: true,
              noCodeConfig: true,
            },
          },
        },
      },
    },
  });
};

export const copySurveyToOtherEnvironment = async (
  environmentId: string,
  surveyId: string,
  targetEnvironmentId: string,
  userId: string
) => {
  try {
    const isSameEnvironment = environmentId === targetEnvironmentId;

    // Fetch required resources
    const [existingEnvironment, existingProject, existingSurvey] = await Promise.all([
      doesEnvironmentExist(environmentId),
      getProjectWithLanguagesByEnvironmentId(environmentId),
      getExistingSurvey(surveyId),
    ]);

    if (!existingEnvironment) throw new ResourceNotFoundError("Environment", environmentId);
    if (!existingProject) throw new ResourceNotFoundError("Project", environmentId);
    if (!existingSurvey) throw new ResourceNotFoundError("Survey", surveyId);

    let targetEnvironment: string | null = null;
    let targetProject: TProjectWithLanguages | null = null;

    if (isSameEnvironment) {
      targetEnvironment = existingEnvironment;
      targetProject = existingProject;
    } else {
      [targetEnvironment, targetProject] = await Promise.all([
        doesEnvironmentExist(targetEnvironmentId),
        getProjectWithLanguagesByEnvironmentId(targetEnvironmentId),
      ]);

      if (!targetEnvironment) throw new ResourceNotFoundError("Environment", targetEnvironmentId);
      if (!targetProject) throw new ResourceNotFoundError("Project", targetEnvironmentId);
    }

    // Fetch existing action classes in target environment for name conflict checks
    const existingActionClasses = !isSameEnvironment
      ? await prisma.actionClass.findMany({
          where: { environmentId: targetEnvironmentId },
          select: { name: true, type: true, key: true, noCodeConfig: true, id: true },
        })
      : [];

    const { ...restExistingSurvey } = existingSurvey;
    const hasLanguages = existingSurvey.languages && existingSurvey.languages.length > 0;

    // Prepare survey data
    const surveyData: Prisma.SurveyCreateInput = {
      ...restExistingSurvey,
      id: createId(),
      name: `${existingSurvey.name} (copy)`,
      type: existingSurvey.type,
      status: "draft",
      welcomeCard: structuredClone(existingSurvey.welcomeCard),
      questions: structuredClone(existingSurvey.questions),
      endings: structuredClone(existingSurvey.endings),
      variables: structuredClone(existingSurvey.variables),
      hiddenFields: structuredClone(existingSurvey.hiddenFields),
      languages: hasLanguages
        ? {
            create: existingSurvey.languages.map((surveyLanguage) => ({
              language: {
                connectOrCreate: {
                  where: {
                    projectId_code: { code: surveyLanguage.language.code, projectId: targetProject.id },
                  },
                  create: {
                    code: surveyLanguage.language.code,
                    alias: surveyLanguage.language.alias,
                    projectId: targetProject.id,
                  },
                },
              },
              default: surveyLanguage.default,
              enabled: surveyLanguage.enabled,
            })),
          }
        : undefined,
      triggers: {
        create: existingSurvey.triggers.map((trigger): Prisma.SurveyTriggerCreateWithoutSurveyInput => {
          //check if an action class with same config already exists
          if (trigger.actionClass.type === "code") {
            const existingActionClass = existingActionClasses.find(
              (ac) => ac.key === trigger.actionClass.key
            );

            if (existingActionClass) {
              return {
                actionClass: { connect: { id: existingActionClass.id } },
              };
            }
          } else if (trigger.actionClass.type === "noCode") {
            const existingActionClass = existingActionClasses.find(
              (ac) => JSON.stringify(ac.noCodeConfig) === JSON.stringify(trigger.actionClass.noCodeConfig)
            );

            if (existingActionClass) {
              return {
                actionClass: { connect: { id: existingActionClass.id } },
              };
            }
          }

          const existingActionClassNames = new Set(existingActionClasses.map((ac) => ac.name));

          // Check if an action class with the same name but different type already exists
          const hasNameConflict =
            !isSameEnvironment && existingActionClassNames.has(trigger.actionClass.name);

          let modifiedName = trigger.actionClass.name;
          if (hasNameConflict) {
            // Find a unique name by appending (copy), (copy 2), (copy 3), etc.
            let copyNumber = 1;
            let candidateName = `${trigger.actionClass.name} (copy)`;

            while (existingActionClassNames.has(candidateName)) {
              copyNumber++;
              candidateName = `${trigger.actionClass.name} (copy ${copyNumber})`;
            }

            modifiedName = candidateName;
          }

          const baseActionClassData = {
            name: modifiedName,
            environment: { connect: { id: targetEnvironmentId } },
            description: trigger.actionClass.description,
            type: trigger.actionClass.type,
          };

          if (isSameEnvironment) {
            return {
              actionClass: { connect: { id: trigger.actionClass.id } },
            };
          } else if (trigger.actionClass.type === "code") {
            return {
              actionClass: {
                connectOrCreate: {
                  where: {
                    key_environmentId: {
                      key: trigger.actionClass.key!,
                      environmentId: targetEnvironmentId,
                    },
                  },
                  create: {
                    ...baseActionClassData,
                    key: trigger.actionClass.key,
                  },
                },
              },
            };
          } else {
            if (hasNameConflict) {
              return {
                actionClass: {
                  create: {
                    ...baseActionClassData,
                    noCodeConfig: trigger.actionClass.noCodeConfig
                      ? structuredClone(trigger.actionClass.noCodeConfig)
                      : undefined,
                  },
                },
              };
            }
            return {
              actionClass: {
                connectOrCreate: {
                  where: {
                    name_environmentId: {
                      name: trigger.actionClass.name,
                      environmentId: targetEnvironmentId,
                    },
                  },
                  create: {
                    ...baseActionClassData,
                    noCodeConfig: trigger.actionClass.noCodeConfig
                      ? structuredClone(trigger.actionClass.noCodeConfig)
                      : undefined,
                  },
                },
              },
            };
          }
        }),
      },
      environment: {
        connect: {
          id: targetEnvironmentId,
        },
      },
      creator: {
        connect: {
          id: userId,
        },
      },
      surveyClosedMessage: existingSurvey.surveyClosedMessage
        ? structuredClone(existingSurvey.surveyClosedMessage)
        : Prisma.JsonNull,
      singleUse: existingSurvey.singleUse ? structuredClone(existingSurvey.singleUse) : Prisma.JsonNull,
      projectOverwrites: existingSurvey.projectOverwrites
        ? structuredClone(existingSurvey.projectOverwrites)
        : Prisma.JsonNull,
      styling: existingSurvey.styling ? structuredClone(existingSurvey.styling) : Prisma.JsonNull,
      segment: undefined,
      followUps: {
        createMany: {
          data: existingSurvey.followUps.map((followUp) => ({
            name: followUp.name,
            trigger: followUp.trigger,
            action: followUp.action,
          })),
        },
      },
    };

    // Handle segment
    if (existingSurvey.segment) {
      if (existingSurvey.segment.isPrivate) {
        surveyData.segment = {
          create: {
            title: surveyData.id!,
            isPrivate: true,
            filters: existingSurvey.segment.filters,
            environment: { connect: { id: targetEnvironmentId } },
          },
        };
      } else if (isSameEnvironment) {
        surveyData.segment = { connect: { id: existingSurvey.segment.id } };
      } else {
        const existingSegmentInTargetEnvironment = await prisma.segment.findFirst({
          where: {
            title: existingSurvey.segment.title,
            isPrivate: false,
            environmentId: targetEnvironmentId,
          },
        });

        surveyData.segment = {
          create: {
            title: existingSegmentInTargetEnvironment
              ? `${existingSurvey.segment.title}-${Date.now()}`
              : existingSurvey.segment.title,
            isPrivate: false,
            filters: existingSurvey.segment.filters,
            environment: { connect: { id: targetEnvironmentId } },
          },
        };
      }
    }

    if (surveyData.questions) checkForInvalidImagesInQuestions(surveyData.questions);

    const newSurvey = await prisma.survey.create({
      data: surveyData,
      select: {
        id: true,
        environmentId: true,
        segment: {
          select: {
            id: true,
          },
        },
        triggers: {
          select: {
            actionClass: {
              select: {
                id: true,
                name: true,
                environmentId: true,
              },
            },
          },
        },
        languages: {
          select: {
            language: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    return newSurvey;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error(error, "Error copying survey to other environment");
      throw new DatabaseError(error.message);
    }
    throw error;
  }
};

export const getSurveyCount = reactCache(async (environmentId: string): Promise<number> => {
  validateInputs([environmentId, z.string().cuid2()]);
  try {
    const surveyCount = await prisma.survey.count({
      where: {
        environmentId: environmentId,
      },
    });

    return surveyCount;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      logger.error(error, "Error getting survey count");
      throw new DatabaseError(error.message);
    }

    throw error;
  }
});
