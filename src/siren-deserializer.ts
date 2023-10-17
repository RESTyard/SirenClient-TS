import { map } from 'rxjs';

import { HttpClient } from './contracts/HttpClient';
import { SirenClientObject } from './SirenModel/siren-client-object';
import { HypermediaLink } from './SirenModel/hypermedia-link';
import { PropertyInfo, PropertyTypes } from './SirenModel/property-info';
import { ActionType, HttpMethodTypes, HypermediaAction } from './SirenModel/hypermedia-action';
import { ReflectionHelpers } from './reflection-helpers';
import { SchemaSimplifier } from './schema-simplifier';
import { EmbeddedLinkEntity } from './SirenModel/embedded-link-entity';
import { IEmbeddedEntity , ISirenClientObject} from './SirenModel/entity-interfaces';
import { EmbeddedEntity } from './SirenModel/embedded-entity';
import { ObservableLruCache } from './observable-lru-cache';

import { MediaTypes } from "./MediaTypes";

export class SirenDeserializer {
  private readonly waheActionTypes = [MediaTypes.Json, MediaTypes.FormData, MediaTypes.OctetStream];

  private static httpInputTypeFile = 'file';
  constructor(
      private httpClient: HttpClient,
      private schemaCache: ObservableLruCache<object>, // todo convert to interface, let users inject it 
      private schemaSimplifier: SchemaSimplifier // todo convert to interface, let users inject it
    ) {

  }

  deserialize = (raw: any): SirenClientObject => {
    const result = new SirenClientObject();
    this.deserializeEntity(raw, result);

    return result;
  }

  private deserializeEmbeddedEntity = (raw: any): EmbeddedEntity => {
    const result = new EmbeddedEntity();
    result.relations = [...raw.rel];
    this.deserializeEntity(raw, result);

    return result;
  }

  private deserializeEntity = (raw: any, result: ISirenClientObject) => {
    if (ReflectionHelpers.hasFilledArrayProperty(raw, 'class')) {
      result.classes = [...(<string[]>raw.class)];
    }

    if (ReflectionHelpers.hasFilledProperty(raw, 'title')) {
      result.title = raw.title;
    }

    result.links = this.deserializeLinks(raw);
    result.properties = this.deserializeProperties(raw); // todo do not create info objects here, migth not be needed
    result.actions = this.deserializeActions(raw);

    // todo preserve order of embeddedLinkEntitys and embeddedEntity, splitting formly-types changes order
    if (ReflectionHelpers.hasFilledArrayProperty(raw, 'entities')) {
      result.embeddedLinkEntities = this.deserializeEmbeddedLinkEntity(raw.entities);
      result.embeddedEntities = this.deserializeEmbeddedEntitys(raw.entities);
    }
  }

  private deserializeLinks = (raw: any): HypermediaLink[] => {
    const result = new Array<HypermediaLink>();

    if (!ReflectionHelpers.hasFilledArrayProperty(raw, 'links')) {
      return result;
    }

    const links: any[] = raw.links;
    links.forEach(link => {
      result.push(new HypermediaLink([...link.rel], link.href, link.type));
    });

    return result;
  }

  deserializeProperties = (raw: any): PropertyInfo[] => {
    const result = new Array<PropertyInfo>();

    if (!ReflectionHelpers.hasFilledProperty(raw, 'properties')) {
      return result;
    }

    const properties: any = raw.properties;
    for (const property in properties) {
      if (!properties.hasOwnProperty(property)) {
        continue;
      }

      const value = properties[property];
      const propertyType = typeof value;


      if (value === null) {
        result.push(new PropertyInfo(property, value, PropertyTypes.nullvalue));
        continue;
      }

      switch (propertyType) {
        case 'number':
          result.push(new PropertyInfo(property, value, PropertyTypes.number));
          break;

        case 'boolean':
          result.push(new PropertyInfo(property, value, PropertyTypes.boolean));
          break;

        case 'string':
          result.push(new PropertyInfo(property, value, PropertyTypes.string));
          break;

        case 'object':
          if (Array.isArray(value)) {
            result.push(new PropertyInfo(property, value, PropertyTypes.array)); // todo nested values
          } else {
            result.push(new PropertyInfo(property, value, PropertyTypes.object)); // todo nested values
          }

          break;

        case 'undefined':
        case 'function':
        case 'symbol':
        default:
          continue;
      }
    }

    return result;
  }

  deserializeActions = (raw: any): HypermediaAction[] => {
    const result = new Array<HypermediaAction>();

    if (!ReflectionHelpers.hasFilledArrayProperty(raw, 'actions')) {
      return result;
    }

    const actions: any[] = raw.actions;
    actions.forEach(action => {
      const hypermediaAction = new HypermediaAction();
      hypermediaAction.name = action.name;

      if (ReflectionHelpers.hasFilledArrayProperty(action, 'class')) {
        hypermediaAction.classes = [...action.class];
      }

      hypermediaAction.method = this.getMethod(action);

      hypermediaAction.href = action.href;
      hypermediaAction.title = action.title;
      hypermediaAction.type = action.type;

      this.deserializeActionParameters(action, hypermediaAction);

      result.push(hypermediaAction);
    });

    return result;
  }

  deserializeActionParameters = (action: any, hypermediaAction: HypermediaAction) => {
    if (!ReflectionHelpers.hasFilledArrayProperty(action, 'fields') || action.fields.length === 0) {
      hypermediaAction.actionType = ActionType.NoParameters;
      return;
    } else {
      this.parseWaheStyleParameters(action, hypermediaAction);
    }
  }

  private getMethod = (action: any): HttpMethodTypes => {
    let method = HttpMethodTypes[action.method as keyof typeof HttpMethodTypes];

    // default value for siren is GET
    if (!method) {
      method = HttpMethodTypes.GET;
    }

    return method;
  }

  deserializeEmbeddedEntitys = (entities: Array<any>): Array<IEmbeddedEntity> => {
    const result = new Array<EmbeddedEntity>();
    entities.forEach(entity => {
      if (this.isEmbeddedLinkEntity(entity)) {
        return;
      }

      const embeddedEntity = this.deserializeEmbeddedEntity(entity);
      result.push(embeddedEntity);
    });

    return result;
  }

  deserializeEmbeddedLinkEntity = (entities: Array<any>): Array<EmbeddedLinkEntity> => {
    const result = new Array<EmbeddedLinkEntity>();

    entities.forEach(entity => {
      if (!this.isEmbeddedLinkEntity(entity)) {
        return;
      }

      const linkEntity = new EmbeddedLinkEntity();
      linkEntity.href = entity.href;
      linkEntity.relations = [...entity.rel];
      linkEntity.classes = [...entity.class];
      linkEntity.title = entity.title;
      linkEntity.mediaType = entity.mediaType;

      result.push(linkEntity);
    });

    return result;
  }

  private isEmbeddedLinkEntity = (entity: any) => {
    if (entity.hasOwnProperty('href')) {
      return true;
    }

    return false;
  }

  parseWaheStyleParameters = (action: any, hypermediaAction: HypermediaAction) => {
    if (!ReflectionHelpers.hasProperty(action, 'type') || !this.waheActionTypes.includes(action.type)) {
      throw new Error(`Only supporting actions with types="${this.waheActionTypes.join()}". [action ${action.name}]`); // todo parse standard siren
    }

    if (!ReflectionHelpers.hasFilledArrayProperty(action, 'fields')) {
      throw new Error(`no property fields of type array found, which is required. [action ${action.name}]`);
    }

    if (action.fields.length !== 1) {
      throw new Error(`Action field may only contain one entry. [action ${action.name}]`);
    }

    const actionField = action.fields[0];
    hypermediaAction.waheActionParameterName = actionField.name;

    hypermediaAction.fieldType = actionField.type;
    if (!actionField.name) {
      throw new Error(`Action field must contain a name. [action ${action.name}]`);
    }
    hypermediaAction.waheActionParameterName = actionField.name;
    if (actionField.class) {
      hypermediaAction.waheActionParameterClasses = [...actionField.class];
    }

    switch (hypermediaAction.fieldType) {
      case MediaTypes.Json:
        this.fillJsonParameterInformation(hypermediaAction, action, actionField);
        break;
      case SirenDeserializer.httpInputTypeFile:
        this.fillFileUploadInformation(hypermediaAction, action, actionField);
        break;
      default:
    }

  }

  private fillFileUploadInformation = (hypermediaAction: HypermediaAction, action: any, actionField: any) => {
    hypermediaAction.actionType = ActionType.FileUpload;

    if (actionField.maxFileSizeBytes) {
      hypermediaAction.FileUploadConfiguration.MaxFileSizeBytes = actionField.maxFileSizeBytes;
    }

    if (actionField.allowMultiple) {
      hypermediaAction.FileUploadConfiguration.AllowMultiple = actionField.allowMultiple;
    }

    if (actionField.accept) {
      hypermediaAction.FileUploadConfiguration.Accept = actionField.accept.split(",");
    }
  }

  private fillJsonParameterInformation = (hypermediaAction: HypermediaAction, action: any, actionField: any) => {
    hypermediaAction.actionType = ActionType.JsonObjectParameters;

    if (!hypermediaAction.waheActionParameterClasses || hypermediaAction.waheActionParameterClasses.length !== 1) {
      throw new Error(`Action field must contain one class. [action ${action.name}]`);
    }

    //Map default values if exist
    hypermediaAction.defaultValues = actionField?.value;

    this.getActionParameterJsonSchema(hypermediaAction.waheActionParameterClasses[0], hypermediaAction);
  }

  // todo handle error
  getActionParameterJsonSchema = (schemaUrl: string, hypermediaAction: HypermediaAction) => {
    const cached = this.schemaCache.getItem(schemaUrl);
    if (cached) {
      hypermediaAction.waheActionParameterJsonSchema = cached;
      return;
    }

    const simplifiedResponse$ = this.httpClient.get(schemaUrl)
      .pipe(
        map(response => {
          this.schemaSimplifier.simplifySchema(response);
          return response;
        })
      );

    const cachedResponse = this.schemaCache.addItem(schemaUrl, simplifiedResponse$);
    hypermediaAction.waheActionParameterJsonSchema = cachedResponse;
  }
}
