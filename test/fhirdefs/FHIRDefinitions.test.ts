import { FHIRDefinitions, createFHIRDefinitions } from '../../src/fhirdefs/FHIRDefinitions';
import { Type } from '../../src/utils/Fishable';
import {
  getLocalVirtualPackage,
  getTestFHIRDefinitions,
  loggerSpy,
  testDefsPath,
  TestFHIRDefinitions
} from '../testhelpers';
import { R5_DEFINITIONS_NEEDED_IN_R4 } from '../../src/fhirdefs/R5DefsForR4';
import { InMemoryVirtualPackage } from 'fhir-package-loader';
import { StructureDefinition, ValueSet, CodeSystem } from '../../src/fhirtypes';
import { PREDEFINED_PACKAGE_NAME, PREDEFINED_PACKAGE_VERSION } from '../../src/ig';
import { logMessage } from '../../src/utils';

describe('FHIRDefinitions', () => {
  let defs: FHIRDefinitions;
  let r4bDefs: FHIRDefinitions;
  let r5Defs: FHIRDefinitions;
  beforeAll(async () => {
    defs = await createFHIRDefinitions();
    // Add the R5toR4 resources. This mirrors what happens in Processing.ts.
    const R5forR4Map = new Map<string, any>();
    R5_DEFINITIONS_NEEDED_IN_R4.forEach(def => R5forR4Map.set(def.id, def));
    const virtualR5forR4Package = new InMemoryVirtualPackage(
      { name: 'sushi-r5forR4', version: '1.0.0' },
      R5forR4Map
    );
    await defs.loadVirtualPackage(virtualR5forR4Package);
    await defs.loadVirtualPackage(getLocalVirtualPackage(testDefsPath('r4-definitions')));
    // Supplemental R3 defs needed to test fishing for implied extensions
    const r3Defs = await createFHIRDefinitions(true);
    await r3Defs.loadVirtualPackage(getLocalVirtualPackage(testDefsPath('r3-definitions')));
    defs.addSupplementalFHIRDefinitions('hl7.fhir.r3.core#3.0.2', r3Defs);
    r4bDefs = await createFHIRDefinitions();
    // Add the R5toR4 resources. This mirrors what happens in Processing.ts.
    await r4bDefs.loadVirtualPackage(virtualR5forR4Package);
    await r4bDefs.loadVirtualPackage(getLocalVirtualPackage(testDefsPath('r4b-definitions')));
    r5Defs = await createFHIRDefinitions();
    await r5Defs.loadVirtualPackage(getLocalVirtualPackage(testDefsPath('r5-definitions')));
    // Add custom/predefined resources. This approximates SUSHI behavior by using the special package name.
    const predefinedResourceMap = new Map<string, any>();
    const myPredefinedProfile = new StructureDefinition();
    myPredefinedProfile.name = 'MyPredefinedProfile';
    myPredefinedProfile.id = 'my-predefined-profile';
    myPredefinedProfile.url = 'http://example.com/StructureDefinition/my-predefined-profile';
    predefinedResourceMap.set('my-predefined-profile', myPredefinedProfile.toJSON(true));
    const someCodesPredefinedValueSet = new ValueSet();
    someCodesPredefinedValueSet.name = 'SomeCodes';
    someCodesPredefinedValueSet.id = 'some-codes';
    someCodesPredefinedValueSet.url = 'http://example.com/ValueSet/some-codes';
    predefinedResourceMap.set('some-codes-vs', someCodesPredefinedValueSet);
    const someCodesPredefinedCodeSystem = new CodeSystem();
    someCodesPredefinedCodeSystem.name = 'SomeCodes';
    someCodesPredefinedCodeSystem.id = 'some-codes';
    someCodesPredefinedCodeSystem.url = 'http://example.com/CodeSystem/some-codes';
    predefinedResourceMap.set('some-codes-cs', someCodesPredefinedCodeSystem);
    const predefinedPkg = new InMemoryVirtualPackage(
      { name: PREDEFINED_PACKAGE_NAME, version: PREDEFINED_PACKAGE_VERSION },
      predefinedResourceMap,
      { log: logMessage, allowNonResources: true }
    );
    await defs.loadVirtualPackage(predefinedPkg);
  });

  beforeEach(() => {
    loggerSpy.reset();
  });

  describe('#fishForFHIR()', () => {
    it('should find base FHIR resources', () => {
      const conditionByID = defs.fishForFHIR('Condition', Type.Resource);
      expect(conditionByID.url).toBe('http://hl7.org/fhir/StructureDefinition/Condition');
      expect(conditionByID.fhirVersion).toBe('4.0.1');
      expect(
        defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/Condition', Type.Resource)
      ).toEqual(conditionByID);
    });

    it('should find base FHIR logical models', () => {
      const eLTSSServiceModelByID = defs.fishForFHIR('eLTSSServiceModel', Type.Logical);
      expect(eLTSSServiceModelByID.url).toBe(
        'http://hl7.org/fhir/us/eltss/StructureDefinition/eLTSSServiceModel'
      );
      expect(eLTSSServiceModelByID.version).toBe('0.1.0');
      expect(
        defs.fishForFHIR(
          'http://hl7.org/fhir/us/eltss/StructureDefinition/eLTSSServiceModel',
          Type.Logical
        )
      ).toEqual(eLTSSServiceModelByID);
    });

    it('should find base FHIR primitive types', () => {
      const booleanByID = defs.fishForFHIR('boolean', Type.Type);
      expect(booleanByID.url).toBe('http://hl7.org/fhir/StructureDefinition/boolean');
      expect(booleanByID.fhirVersion).toBe('4.0.1');
      expect(
        defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/boolean', Type.Type)
      ).toEqual(booleanByID);
    });

    it('should find base FHIR complex types', () => {
      const addressByID = defs.fishForFHIR('Address', Type.Type);
      expect(addressByID.url).toBe('http://hl7.org/fhir/StructureDefinition/Address');
      expect(addressByID.fhirVersion).toBe('4.0.1');
      expect(
        defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/Address', Type.Type)
      ).toEqual(addressByID);
    });

    it('should find base FHIR profiles', () => {
      const vitalSignsByID = defs.fishForFHIR('vitalsigns', Type.Profile);
      expect(vitalSignsByID.url).toBe('http://hl7.org/fhir/StructureDefinition/vitalsigns');
      expect(vitalSignsByID.fhirVersion).toBe('4.0.1');
      expect(defs.fishForFHIR('observation-vitalsigns', Type.Profile)).toEqual(vitalSignsByID);
      expect(
        defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/vitalsigns', Type.Profile)
      ).toEqual(vitalSignsByID);
    });

    it('should find base FHIR profiles of logical models', () => {
      const serviceProfileByID = defs.fishForFHIR('service-profile', Type.Profile);
      expect(serviceProfileByID.url).toBe(
        'http://hl7.org/fhir/some/example/StructureDefinition/ServiceProfile'
      );
      expect(serviceProfileByID.fhirVersion).toBe('4.0.1');
      expect(defs.fishForFHIR('ServiceProfile', Type.Profile)).toEqual(serviceProfileByID);
      expect(
        defs.fishForFHIR(
          'http://hl7.org/fhir/some/example/StructureDefinition/ServiceProfile',
          Type.Profile
        )
      ).toEqual(serviceProfileByID);
    });

    it('should find base FHIR extensions', () => {
      const maidenNameExtensionByID = defs.fishForFHIR('patient-mothersMaidenName', Type.Extension);
      expect(maidenNameExtensionByID.url).toBe(
        'http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName'
      );
      expect(maidenNameExtensionByID.fhirVersion).toBe('4.0.1');
      expect(defs.fishForFHIR('mothersMaidenName', Type.Extension)).toEqual(
        maidenNameExtensionByID
      );
      expect(
        defs.fishForFHIR(
          'http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName',
          Type.Extension
        )
      ).toEqual(maidenNameExtensionByID);
    });

    it('should find implied extensions from other versions of FHIR', () => {
      // See: http://hl7.org/fhir/versions.html#extensions
      const patientAnimalExtensionSTU3 = defs.fishForFHIR(
        'http://hl7.org/fhir/3.0/StructureDefinition/extension-Patient.animal',
        Type.Extension
      );
      // Just do a spot check as the detailed behavior is tested in the implied extension tests.
      expect(patientAnimalExtensionSTU3).toMatchObject({
        resourceType: 'StructureDefinition',
        id: 'extension-Patient.animal',
        url: 'http://hl7.org/fhir/3.0/StructureDefinition/extension-Patient.animal',
        version: '3.0.2',
        name: 'Extension_Patient_animal',
        title: 'Implied extension for Patient.animal',
        description: 'Implied extension for Patient.animal',
        fhirVersion: '4.0.1'
      });
      const diffRoot = patientAnimalExtensionSTU3.differential?.element?.[0];
      expect(diffRoot.short).toEqual('This patient is known to be an animal (non-human)');
    });

    it('should not find implied extensions for versions of FHIR that are not loaded', () => {
      const patientAnimalExtensionDSTU2 = defs.fishForFHIR(
        'http://hl7.org/fhir/1.0/StructureDefinition/extension-Patient.animal',
        Type.Extension
      );
      expect(patientAnimalExtensionDSTU2).toBeUndefined();
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /The extension http:\/\/hl7\.org\/fhir\/1\.0\/StructureDefinition\/extension-Patient\.animal requires/
      );
    });

    it('should find base FHIR value sets', () => {
      const allergyStatusValueSetByID = defs.fishForFHIR(
        'allergyintolerance-clinical',
        Type.ValueSet
      );
      expect(allergyStatusValueSetByID.url).toBe(
        'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical'
      );
      // For some reason, value sets don't specify a fhirVersion, but in this case the business
      // version is the FHIR version, so we'll verify that instead
      expect(allergyStatusValueSetByID.version).toBe('4.0.1');
      expect(defs.fishForFHIR('AllergyIntoleranceClinicalStatusCodes', Type.ValueSet)).toEqual(
        allergyStatusValueSetByID
      );
      expect(
        defs.fishForFHIR('http://hl7.org/fhir/ValueSet/allergyintolerance-clinical', Type.ValueSet)
      ).toEqual(allergyStatusValueSetByID);
    });

    it('should find base FHIR code sytems', () => {
      // Surprise!  It turns out that the AllergyIntolerance status value set and code system
      // have the same ID!
      const allergyStatusCodeSystemByID = defs.fishForFHIR(
        'allergyintolerance-clinical',
        Type.CodeSystem
      );
      expect(allergyStatusCodeSystemByID.url).toBe(
        'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical'
      );
      // For some reason, code systems don't specify a fhirVersion, but in this case the business
      // version is the FHIR version, so we'll verify that instead
      expect(allergyStatusCodeSystemByID.version).toBe('4.0.1');
      expect(defs.fishForFHIR('AllergyIntoleranceClinicalStatusCodes', Type.CodeSystem)).toEqual(
        allergyStatusCodeSystemByID
      );
      expect(
        defs.fishForFHIR(
          'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          Type.CodeSystem
        )
      ).toEqual(allergyStatusCodeSystemByID);
    });

    it('should find other types when the fished type is Type.Instance', () => {
      const individualGenderSearchParamByID = defs.fishForFHIR('individual-gender', Type.Instance);
      expect(individualGenderSearchParamByID.url).toBe(
        'http://hl7.org/fhir/SearchParameter/individual-gender'
      );
      expect(individualGenderSearchParamByID.version).toBe('4.0.1');
      expect(defs.fishForFHIR('gender', Type.Instance)).toEqual(individualGenderSearchParamByID);
      expect(
        defs.fishForFHIR('http://hl7.org/fhir/SearchParameter/individual-gender', Type.Instance)
      ).toEqual(individualGenderSearchParamByID);
    });

    it('should find the time-traveling R5 FHIR resources when R4 is loaded', () => {
      ['ActorDefinition', 'Requirements', 'SubscriptionTopic', 'TestPlan'].forEach(r => {
        const resourceById = defs.fishForFHIR(r, Type.Resource);
        expect(resourceById).toBeDefined();
        expect(resourceById.id).toBe(r);
        expect(resourceById.url).toBe(`http://hl7.org/fhir/StructureDefinition/${r}`);
        expect(resourceById.fhirVersion).toBe('5.0.0');
        expect(resourceById._timeTraveler).toBeTrue();
        expect(defs.fishForFHIR(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          resourceById
        );
      });
    });

    it('should find the time-traveling R5 FHIR types when R4 is loaded', () => {
      ['Base', 'CodeableReference', 'DataType'].forEach(r => {
        const typeById = defs.fishForFHIR(r, Type.Type);
        expect(typeById).toBeDefined();
        expect(typeById.id).toBe(r);
        expect(typeById.url).toBe(`http://hl7.org/fhir/StructureDefinition/${r}`);
        expect(typeById.fhirVersion).toBe('5.0.0');
        expect(typeById._timeTraveler).toBeTrue();
        expect(defs.fishForFHIR(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(typeById);
      });
    });

    it('should find the time-traveling R5 FHIR resources when R4B is loaded', () => {
      ['ActorDefinition', 'Requirements', 'TestPlan'].forEach(r => {
        const resourceById = r4bDefs.fishForFHIR(r, Type.Resource);
        expect(resourceById).toBeDefined();
        expect(resourceById.id).toBe(r);
        expect(resourceById.url).toBe(`http://hl7.org/fhir/StructureDefinition/${r}`);
        expect(resourceById.fhirVersion).toBe('5.0.0');
        expect(resourceById._timeTraveler).toBeTrue();
        expect(r4bDefs.fishForFHIR(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          resourceById
        );
      });
    });

    it('should overwrite time-traveling R5 FHIR resources that are in R4B when R4B is loaded', () => {
      ['SubscriptionTopic'].forEach(r => {
        const resourceById = r4bDefs.fishForFHIR(r, Type.Resource);
        expect(resourceById).toBeDefined();
        expect(resourceById.id).toBe(r);
        expect(resourceById.url).toBe(`http://hl7.org/fhir/StructureDefinition/${r}`);
        expect(resourceById.fhirVersion).toBe('4.3.0');
        expect(resourceById._timeTraveler).toBeUndefined();
        expect(r4bDefs.fishForFHIR(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          resourceById
        );
      });
    });

    it('should find the time-traveling R5 FHIR types when R4B is loaded', () => {
      ['Base', 'DataType'].forEach(r => {
        const typeById = r4bDefs.fishForFHIR(r, Type.Type);
        expect(typeById).toBeDefined();
        expect(typeById.id).toBe(r);
        expect(typeById.url).toBe(`http://hl7.org/fhir/StructureDefinition/${r}`);
        expect(typeById.fhirVersion).toBe('5.0.0');
        expect(typeById._timeTraveler).toBeTrue();
        expect(r4bDefs.fishForFHIR(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          typeById
        );
      });
    });

    it('should overwrite time-traveling R5 FHIR types that are in R4B when R4B is loaded', () => {
      ['CodeableReference'].forEach(r => {
        const typeById = r4bDefs.fishForFHIR(r, Type.Type);
        expect(typeById).toBeDefined();
        expect(typeById.id).toBe(r);
        expect(typeById.url).toBe(`http://hl7.org/fhir/StructureDefinition/${r}`);
        expect(typeById.fhirVersion).toBe('4.3.0');
        expect(typeById._timeTraveler).toBeUndefined();
        expect(r4bDefs.fishForFHIR(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          typeById
        );
      });
    });

    it('should overwrite time-traveling R5 FHIR Resources when R5 is loaded', () => {
      ['ActorDefinition', 'Requirements', 'SubscriptionTopic', 'TestPlan'].forEach(r => {
        const resourceById = r5Defs.fishForFHIR(r, Type.Resource);
        expect(resourceById).toBeDefined();
        expect(resourceById.id).toBe(r);
        expect(resourceById.url).toBe(`http://hl7.org/fhir/StructureDefinition/${r}`);
        expect(resourceById.fhirVersion).toBe('5.0.0');
        expect(resourceById._timeTraveler).toBeUndefined();
        expect(r5Defs.fishForFHIR(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          resourceById
        );
      });
    });

    it('should overwrite time-traveling R5 FHIR Types when R5 is loaded', () => {
      ['Base', 'CodeableReference', , 'DataType'].forEach(r => {
        const typeById = r5Defs.fishForFHIR(r, Type.Type);
        expect(typeById).toBeDefined();
        expect(typeById.id).toBe(r);
        expect(typeById.url).toBe(`http://hl7.org/fhir/StructureDefinition/${r}`);
        expect(typeById.fhirVersion).toBe('5.0.0');
        expect(typeById._timeTraveler).toBeUndefined();
        expect(r5Defs.fishForFHIR(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          typeById
        );
      });
    });

    it('should find definitions by the enforced type order', () => {
      // NOTE: There are two things with id allergyintolerance-clinical (the ValueSet and CodeSystem)
      const allergyStatusValueSetByID = defs.fishForFHIR(
        'allergyintolerance-clinical',
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(allergyStatusValueSetByID.resourceType).toBe('ValueSet');

      const allergyStatusCodeSystemByID = defs.fishForFHIR(
        'allergyintolerance-clinical',
        Type.CodeSystem,
        Type.ValueSet
      );
      expect(allergyStatusCodeSystemByID.resourceType).toBe('ValueSet');
    });

    it('should not find the definition when the type is not requested', () => {
      const conditionByID = defs.fishForFHIR(
        'Condition',
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(conditionByID).toBeUndefined();

      const booleanByID = defs.fishForFHIR(
        'boolean',
        Type.Resource,
        Type.Logical,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(booleanByID).toBeUndefined();

      const addressByID = defs.fishForFHIR(
        'Address',
        Type.Resource,
        Type.Logical,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(addressByID).toBeUndefined();

      const vitalSignsProfileByID = defs.fishForFHIR(
        'vitalsigns',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(vitalSignsProfileByID).toBeUndefined();

      const maidenNameExtensionByID = defs.fishForFHIR(
        'patient-mothersMaidenName',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(maidenNameExtensionByID).toBeUndefined();

      // NOTE: There are two things with id allergyintolerance-clinical (the ValueSet and CodeSystem)
      const allergyStatusValueSetByID = defs.fishForFHIR(
        'allergyintolerance-clinical',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.Extension
      );
      expect(allergyStatusValueSetByID).toBeUndefined();

      const w3cProvenanceCodeSystemByID = defs.fishForFHIR(
        'w3c-provenance-activity-type',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.Extension,
        Type.ValueSet
      );
      expect(w3cProvenanceCodeSystemByID).toBeUndefined();

      const eLTSSServiceModelByID = defs.fishForFHIR(
        'eLTSSServiceModel',
        Type.Resource,
        Type.Type,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(eLTSSServiceModelByID).toBeUndefined();

      const individualGenderSearchParamByID = defs.fishForFHIR(
        'individual-gender',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(individualGenderSearchParamByID).toBeUndefined();
    });

    it('should globally find any definition', () => {
      const conditionByID = defs.fishForFHIR('Condition');
      expect(conditionByID.kind).toBe('resource');
      expect(conditionByID.fhirVersion).toBe('4.0.1');
      expect(defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/Condition')).toEqual(
        conditionByID
      );

      const booleanByID = defs.fishForFHIR('boolean');
      expect(booleanByID.kind).toBe('primitive-type');
      expect(booleanByID.fhirVersion).toBe('4.0.1');
      expect(defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/boolean')).toEqual(
        booleanByID
      );

      const addressByID = defs.fishForFHIR('Address');
      expect(addressByID.kind).toBe('complex-type');
      expect(addressByID.fhirVersion).toBe('4.0.1');
      expect(defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/Address')).toEqual(
        addressByID
      );

      const vitalSignsProfileByID = defs.fishForFHIR('vitalsigns');
      expect(vitalSignsProfileByID.type).toBe('Observation');
      expect(vitalSignsProfileByID.kind).toBe('resource');
      expect(vitalSignsProfileByID.derivation).toBe('constraint');
      expect(vitalSignsProfileByID.fhirVersion).toBe('4.0.1');
      expect(defs.fishForFHIR('observation-vitalsigns')).toEqual(vitalSignsProfileByID);
      expect(defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/vitalsigns')).toEqual(
        vitalSignsProfileByID
      );

      const maidenNameExtensionByID = defs.fishForFHIR('patient-mothersMaidenName');
      expect(maidenNameExtensionByID.type).toBe('Extension');
      expect(maidenNameExtensionByID.fhirVersion).toBe('4.0.1');
      expect(defs.fishForFHIR('mothersMaidenName')).toEqual(maidenNameExtensionByID);
      expect(
        defs.fishForFHIR('http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName')
      ).toEqual(maidenNameExtensionByID);

      // NOTE: There are two things with id allergyintolerance-clinical (the ValueSet and CodeSystem)
      // When doing a non-type-specific search, we favor the ValueSet
      const allergyStatusValueSetByID = defs.fishForFHIR('allergyintolerance-clinical');
      expect(allergyStatusValueSetByID.resourceType).toBe('ValueSet');
      // For some reason, value sets don't specify a fhirVersion, but in this case the business
      // version is the FHIR version, so we'll verify that instead
      expect(allergyStatusValueSetByID.version).toBe('4.0.1');
      expect(defs.fishForFHIR('AllergyIntoleranceClinicalStatusCodes')).toEqual(
        allergyStatusValueSetByID
      );
      expect(defs.fishForFHIR('http://hl7.org/fhir/ValueSet/allergyintolerance-clinical')).toEqual(
        allergyStatusValueSetByID
      );

      const w3cProvenanceCodeSystemByID = defs.fishForFHIR('w3c-provenance-activity-type');
      expect(w3cProvenanceCodeSystemByID.resourceType).toBe('CodeSystem');
      // For some reason, code systems don't specify a fhirVersion, but in this case the business
      // version is the FHIR version, so we'll verify that instead
      expect(w3cProvenanceCodeSystemByID.version).toBe('4.0.1');
      expect(defs.fishForFHIR('W3cProvenanceActivityType')).toEqual(w3cProvenanceCodeSystemByID);
      expect(defs.fishForFHIR('http://hl7.org/fhir/w3c-provenance-activity-type')).toEqual(
        w3cProvenanceCodeSystemByID
      );

      const eLTSSServiceModelByID = defs.fishForFHIR('eLTSSServiceModel');
      expect(eLTSSServiceModelByID.kind).toBe('logical');
      expect(eLTSSServiceModelByID.derivation).toBe('specialization');
      expect(
        defs.fishForFHIR('http://hl7.org/fhir/us/eltss/StructureDefinition/eLTSSServiceModel')
      ).toEqual(eLTSSServiceModelByID);

      const individualGenderSearchParamByID = defs.fishForFHIR('individual-gender');
      expect(individualGenderSearchParamByID.url).toBe(
        'http://hl7.org/fhir/SearchParameter/individual-gender'
      );
      expect(individualGenderSearchParamByID.version).toBe('4.0.1');
      expect(defs.fishForFHIR('gender')).toEqual(individualGenderSearchParamByID);
      expect(defs.fishForFHIR('http://hl7.org/fhir/SearchParameter/individual-gender')).toEqual(
        individualGenderSearchParamByID
      );
    });
  });

  describe('#fishForMetadata()', () => {
    it('should find base FHIR resources', () => {
      const conditionByID = defs.fishForMetadata('Condition', Type.Resource);
      expect(conditionByID).toEqual({
        abstract: false,
        id: 'Condition',
        name: 'Condition',
        sdType: 'Condition',
        url: 'http://hl7.org/fhir/StructureDefinition/Condition',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-Condition.json')}`
      });
      expect(
        defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/Condition', Type.Resource)
      ).toEqual(conditionByID);
    });

    it('should find profiles with declared imposeProfiles', () => {
      const namedAndGenderedPatientByID = defs.fishForMetadata(
        'named-and-gendered-patient',
        Type.Profile
      );
      expect(namedAndGenderedPatientByID).toEqual({
        abstract: false,
        id: 'named-and-gendered-patient',
        name: 'NamedAndGenderedPatient',
        sdType: 'Patient',
        url: 'http://example.org/impose/StructureDefinition/named-and-gendered-patient',
        version: '0.1.0',
        parent: 'http://hl7.org/fhir/StructureDefinition/Patient',
        resourceType: 'StructureDefinition',
        imposeProfiles: [
          'http://example.org/impose/StructureDefinition/named-patient',
          'http://example.org/impose/StructureDefinition/gendered-patient'
        ],
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-named-and-gendered-patient.json')}`
      });
      expect(defs.fishForMetadata('NamedAndGenderedPatient', Type.Profile)).toEqual(
        namedAndGenderedPatientByID
      );
      expect(
        defs.fishForMetadata(
          'http://example.org/impose/StructureDefinition/named-and-gendered-patient',
          Type.Profile
        )
      ).toEqual(namedAndGenderedPatientByID);
    });

    it('should find base FHIR logical models', () => {
      const eLTSSServiceModelByID = defs.fishForMetadata('eLTSSServiceModel', Type.Logical);
      expect(eLTSSServiceModelByID).toEqual({
        abstract: false,
        id: 'eLTSSServiceModel',
        name: 'ELTSSServiceModel',
        sdType: 'eLTSSServiceModel',
        url: 'http://hl7.org/fhir/us/eltss/StructureDefinition/eLTSSServiceModel',
        version: '0.1.0',
        parent: 'http://hl7.org/fhir/StructureDefinition/Element',
        resourceType: 'StructureDefinition',
        canBeTarget: false,
        canBind: false,
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-eLTSSServiceModel.json')}`
      });
      expect(
        defs.fishForMetadata(
          'http://hl7.org/fhir/us/eltss/StructureDefinition/eLTSSServiceModel',
          Type.Logical
        )
      ).toEqual(eLTSSServiceModelByID);
    });

    it('should find base FHIR primitive types', () => {
      const booleanByID = defs.fishForMetadata('boolean', Type.Type);
      expect(booleanByID).toEqual({
        abstract: false,
        id: 'boolean',
        name: 'boolean',
        sdType: 'boolean',
        url: 'http://hl7.org/fhir/StructureDefinition/boolean',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/Element',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-boolean.json')}`
      });
      expect(
        defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/boolean', Type.Type)
      ).toEqual(booleanByID);
    });

    it('should find base FHIR complex types', () => {
      const addressByID = defs.fishForMetadata('Address', Type.Type);
      expect(addressByID).toEqual({
        abstract: false,
        id: 'Address',
        name: 'Address',
        sdType: 'Address',
        url: 'http://hl7.org/fhir/StructureDefinition/Address',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/Element',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-Address.json')}`
      });
      expect(
        defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/Address', Type.Type)
      ).toEqual(addressByID);
    });

    it('should find base FHIR profiles', () => {
      const vitalSignsByID = defs.fishForMetadata('vitalsigns', Type.Profile);
      expect(vitalSignsByID).toEqual({
        abstract: false,
        id: 'vitalsigns',
        name: 'observation-vitalsigns',
        sdType: 'Observation',
        url: 'http://hl7.org/fhir/StructureDefinition/vitalsigns',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/Observation',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-vitalsigns.json')}`
      });
      expect(defs.fishForMetadata('observation-vitalsigns', Type.Profile)).toEqual(vitalSignsByID);
      expect(
        defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/vitalsigns', Type.Profile)
      ).toEqual(vitalSignsByID);
    });

    it('should find base FHIR extensions', () => {
      const maidenNameExtensionByID = defs.fishForMetadata(
        'patient-mothersMaidenName',
        Type.Extension
      );
      expect(maidenNameExtensionByID).toEqual({
        abstract: false,
        id: 'patient-mothersMaidenName',
        name: 'mothersMaidenName',
        sdType: 'Extension',
        url: 'http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/Extension',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-patient-mothersMaidenName.json')}`
      });
      expect(defs.fishForMetadata('mothersMaidenName', Type.Extension)).toEqual(
        maidenNameExtensionByID
      );
      expect(
        defs.fishForMetadata(
          'http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName',
          Type.Extension
        )
      ).toEqual(maidenNameExtensionByID);
    });

    it('should find base FHIR value sets', () => {
      const allergyStatusValueSetByID = defs.fishForMetadata(
        'allergyintolerance-clinical',
        Type.ValueSet
      );
      expect(allergyStatusValueSetByID).toEqual({
        id: 'allergyintolerance-clinical',
        name: 'AllergyIntoleranceClinicalStatusCodes',
        url: 'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical',
        version: '4.0.1',
        resourceType: 'ValueSet',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'ValueSet-allergyintolerance-clinical.json')}`
      });
      expect(defs.fishForMetadata('AllergyIntoleranceClinicalStatusCodes', Type.ValueSet)).toEqual(
        allergyStatusValueSetByID
      );
      expect(
        defs.fishForMetadata(
          'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical',
          Type.ValueSet
        )
      ).toEqual(allergyStatusValueSetByID);
    });

    it('should find base FHIR code sytems', () => {
      const allergyStatusCodeSystemByID = defs.fishForMetadata(
        'allergyintolerance-clinical',
        Type.CodeSystem
      );
      expect(allergyStatusCodeSystemByID).toEqual({
        id: 'allergyintolerance-clinical',
        name: 'AllergyIntoleranceClinicalStatusCodes',
        url: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
        version: '4.0.1',
        resourceType: 'CodeSystem',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'CodeSystem-allergyintolerance-clinical.json')}`
      });
      expect(
        defs.fishForMetadata('AllergyIntoleranceClinicalStatusCodes', Type.CodeSystem)
      ).toEqual(allergyStatusCodeSystemByID);
      expect(
        defs.fishForMetadata(
          'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          Type.CodeSystem
        )
      ).toEqual(allergyStatusCodeSystemByID);
    });

    it('should find other types when the fished type is Type.Instance', () => {
      const individualGenderSearchParamByID = defs.fishForMetadata(
        'individual-gender',
        Type.Instance
      );
      expect(individualGenderSearchParamByID).toEqual({
        id: 'individual-gender',
        name: 'gender',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'SearchParameter-individual-gender.json')}`,
        resourceType: 'SearchParameter',
        url: 'http://hl7.org/fhir/SearchParameter/individual-gender',
        version: '4.0.1'
      });
      expect(defs.fishForMetadata('gender', Type.Instance)).toEqual(
        individualGenderSearchParamByID
      );
      expect(
        defs.fishForMetadata('http://hl7.org/fhir/SearchParameter/individual-gender', Type.Instance)
      ).toEqual(individualGenderSearchParamByID);
    });

    it('should find the time-traveling R5 FHIR resources when R4 is loaded', () => {
      ['ActorDefinition', 'Requirements', 'SubscriptionTopic', 'TestPlan'].forEach(r => {
        const resourceById = defs.fishForMetadata(r, Type.Resource);
        expect(resourceById).toEqual({
          abstract: false,
          id: r,
          name: r,
          sdType: r,
          url: `http://hl7.org/fhir/StructureDefinition/${r}`,
          version: '5.0.0',
          parent: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
          resourceType: 'StructureDefinition',
          resourcePath: `virtual:sushi-r5forR4#1.0.0:${r}`
        });
        expect(defs.fishForMetadata(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          resourceById
        );
      });
    });

    it('should find the time-traveling R5 FHIR types when R4 is loaded', () => {
      ['Base', 'CodeableReference', 'DataType'].forEach(r => {
        const typeById = defs.fishForMetadata(r, Type.Type);
        expect(typeById).toEqual({
          abstract: r !== 'CodeableReference',
          id: r,
          name: r,
          sdType: r,
          url: `http://hl7.org/fhir/StructureDefinition/${r}`,
          version: '5.0.0',
          parent:
            r === 'Base'
              ? undefined
              : r === 'CodeableReference'
                ? 'http://hl7.org/fhir/StructureDefinition/DataType'
                : 'http://hl7.org/fhir/StructureDefinition/Element',
          resourceType: 'StructureDefinition',
          resourcePath: `virtual:sushi-r5forR4#1.0.0:${r}`
        });
        expect(defs.fishForMetadata(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          typeById
        );
      });
    });

    it('should find the time-traveling R5 FHIR resources when R4B is loaded', () => {
      ['ActorDefinition', 'Requirements', 'SubscriptionTopic', 'TestPlan'].forEach(r => {
        const resourceById = r4bDefs.fishForMetadata(r, Type.Resource);
        expect(resourceById).toEqual({
          abstract: false,
          id: r,
          name: r,
          sdType: r,
          url: `http://hl7.org/fhir/StructureDefinition/${r}`,
          version: r === 'SubscriptionTopic' ? '4.3.0' : '5.0.0',
          parent: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
          resourceType: 'StructureDefinition',
          resourcePath:
            r === 'SubscriptionTopic'
              ? `virtual:sushi-test-2#0.0.1:${testDefsPath('r4b-definitions', 'package', 'StructureDefinition-SubscriptionTopic.json')}`
              : `virtual:sushi-r5forR4#1.0.0:${r}`
        });
        expect(r4bDefs.fishForMetadata(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          resourceById
        );
      });
    });

    it('should find the time-traveling R5 FHIR types when R4B is loaded', () => {
      ['Base', 'CodeableReference', 'DataType'].forEach(r => {
        const typeById = r4bDefs.fishForMetadata(r, Type.Type);
        expect(typeById).toEqual({
          abstract: r !== 'CodeableReference',
          id: r,
          name: r,
          sdType: r,
          url: `http://hl7.org/fhir/StructureDefinition/${r}`,
          version: r === 'CodeableReference' ? '4.3.0' : '5.0.0',
          parent: r === 'Base' ? undefined : 'http://hl7.org/fhir/StructureDefinition/Element',
          resourceType: 'StructureDefinition',
          resourcePath:
            r === 'CodeableReference'
              ? `virtual:sushi-test-2#0.0.1:${testDefsPath('r4b-definitions', 'package', 'StructureDefinition-CodeableReference.json')}`
              : `virtual:sushi-r5forR4#1.0.0:${r}`
        });
        expect(r4bDefs.fishForMetadata(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          typeById
        );
      });
    });

    it('should find the time-traveling R5 FHIR resources when R5 is loaded', () => {
      ['ActorDefinition', 'Requirements', 'SubscriptionTopic', 'TestPlan'].forEach(r => {
        const resourceById = r5Defs.fishForMetadata(r, Type.Resource);
        expect(resourceById).toEqual({
          abstract: false,
          id: r,
          name: r,
          sdType: r,
          url: `http://hl7.org/fhir/StructureDefinition/${r}`,
          version: '5.0.0',
          parent: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
          resourceType: 'StructureDefinition',
          resourcePath: `virtual:sushi-test-3#0.0.1:${testDefsPath('r5-definitions', 'package', `StructureDefinition-${r}.json`)}`
        });
        expect(r5Defs.fishForMetadata(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          resourceById
        );
      });
    });

    it('should find the time-traveling R5 FHIR types when R5 is loaded', () => {
      ['Base', 'CodeableReference', 'DataType'].forEach(r => {
        const typeById = r5Defs.fishForMetadata(r, Type.Type);
        expect(typeById).toEqual({
          abstract: r !== 'CodeableReference',
          id: r,
          name: r,
          sdType: r,
          url: `http://hl7.org/fhir/StructureDefinition/${r}`,
          version: '5.0.0',
          parent:
            r === 'Base'
              ? undefined
              : r === 'CodeableReference'
                ? 'http://hl7.org/fhir/StructureDefinition/DataType'
                : 'http://hl7.org/fhir/StructureDefinition/Element',
          resourceType: 'StructureDefinition',
          resourcePath: `virtual:sushi-test-3#0.0.1:${testDefsPath('r5-definitions', 'package', `StructureDefinition-${r}.json`)}`
        });
        expect(r5Defs.fishForMetadata(`http://hl7.org/fhir/StructureDefinition/${r}`)).toEqual(
          typeById
        );
      });
    });

    it('should find definitions by the enforced type order', () => {
      // NOTE: There are two things with id allergyintolerance-clinical (the ValueSet and CodeSystem)
      const allergyStatusValueSetByID = defs.fishForMetadata(
        'allergyintolerance-clinical',
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(allergyStatusValueSetByID.url).toBe(
        'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical'
      );

      const allergyStatusCodeSystemByID = defs.fishForMetadata(
        'allergyintolerance-clinical',
        Type.CodeSystem,
        Type.ValueSet
      );
      expect(allergyStatusCodeSystemByID.url).toBe(
        'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical'
      );
    });

    it('should not find the definition when the type is not requested', () => {
      const conditionByID = defs.fishForMetadata(
        'Condition',
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(conditionByID).toBeUndefined();

      const booleanByID = defs.fishForMetadata(
        'boolean',
        Type.Resource,
        Type.Logical,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(booleanByID).toBeUndefined();

      const addressByID = defs.fishForMetadata(
        'Address',
        Type.Resource,
        Type.Logical,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(addressByID).toBeUndefined();

      const vitalSignsProfileByID = defs.fishForMetadata(
        'vitalsigns',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(vitalSignsProfileByID).toBeUndefined();

      const maidenNameExtensionByID = defs.fishForMetadata(
        'patient-mothersMaidenName',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(maidenNameExtensionByID).toBeUndefined();

      // NOTE: There are two things with id allergyintolerance-clinical (the ValueSet and CodeSystem)
      const allergyStatusValueSetByID = defs.fishForMetadata(
        'allergyintolerance-clinical',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.Extension
      );
      expect(allergyStatusValueSetByID).toBeUndefined();

      const w3cProvenanceCodeSystemByID = defs.fishForMetadata(
        'w3c-provenance-activity-type',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.Extension,
        Type.ValueSet
      );
      expect(w3cProvenanceCodeSystemByID).toBeUndefined();

      const eLTSSServiceModelByID = defs.fishForMetadata(
        'eLTSSServiceModel',
        Type.Resource,
        Type.Type,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(eLTSSServiceModelByID).toBeUndefined();

      const individualGenderSearchParamByID = defs.fishForFHIR(
        'individual-gender',
        Type.Resource,
        Type.Logical,
        Type.Type,
        Type.Profile,
        Type.Extension,
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(individualGenderSearchParamByID).toBeUndefined();
    });

    it('should globally find any definition', () => {
      const conditionByID = defs.fishForMetadata('Condition');
      expect(conditionByID).toEqual({
        abstract: false,
        id: 'Condition',
        name: 'Condition',
        sdType: 'Condition',
        url: 'http://hl7.org/fhir/StructureDefinition/Condition',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-Condition.json')}`
      });
      expect(defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/Condition')).toEqual(
        conditionByID
      );

      const booleanByID = defs.fishForMetadata('boolean');
      expect(booleanByID).toEqual({
        abstract: false,
        id: 'boolean',
        name: 'boolean',
        sdType: 'boolean',
        url: 'http://hl7.org/fhir/StructureDefinition/boolean',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/Element',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-boolean.json')}`
      });
      expect(defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/boolean')).toEqual(
        booleanByID
      );

      const addressByID = defs.fishForMetadata('Address');
      expect(addressByID).toEqual({
        abstract: false,
        id: 'Address',
        name: 'Address',
        sdType: 'Address',
        url: 'http://hl7.org/fhir/StructureDefinition/Address',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/Element',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-Address.json')}`
      });
      expect(defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/Address')).toEqual(
        addressByID
      );

      const vitalSignsProfileByID = defs.fishForMetadata('vitalsigns');
      expect(vitalSignsProfileByID).toEqual({
        abstract: false,
        id: 'vitalsigns',
        name: 'observation-vitalsigns',
        sdType: 'Observation',
        url: 'http://hl7.org/fhir/StructureDefinition/vitalsigns',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/Observation',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-vitalsigns.json')}`
      });
      expect(defs.fishForMetadata('observation-vitalsigns')).toEqual(vitalSignsProfileByID);
      expect(defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/vitalsigns')).toEqual(
        vitalSignsProfileByID
      );

      const maidenNameExtensionByID = defs.fishForMetadata('patient-mothersMaidenName');
      expect(maidenNameExtensionByID).toEqual({
        abstract: false,
        id: 'patient-mothersMaidenName',
        name: 'mothersMaidenName',
        sdType: 'Extension',
        url: 'http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/Extension',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-patient-mothersMaidenName.json')}`
      });
      expect(defs.fishForMetadata('mothersMaidenName')).toEqual(maidenNameExtensionByID);
      expect(
        defs.fishForMetadata('http://hl7.org/fhir/StructureDefinition/patient-mothersMaidenName')
      ).toEqual(maidenNameExtensionByID);

      // NOTE: There are two things with id allergyintolerance-clinical (the ValueSet and CodeSystem)
      // When doing a non-type-specific search, we favor the ValueSet
      const allergyStatusValueSetByID = defs.fishForMetadata('allergyintolerance-clinical');
      expect(allergyStatusValueSetByID).toEqual({
        id: 'allergyintolerance-clinical',
        name: 'AllergyIntoleranceClinicalStatusCodes',
        url: 'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical',
        version: '4.0.1',
        resourceType: 'ValueSet',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'ValueSet-allergyintolerance-clinical.json')}`
      });
      expect(defs.fishForMetadata('AllergyIntoleranceClinicalStatusCodes')).toEqual(
        allergyStatusValueSetByID
      );
      expect(
        defs.fishForMetadata('http://hl7.org/fhir/ValueSet/allergyintolerance-clinical')
      ).toEqual(allergyStatusValueSetByID);

      const w3cProvenanceCodeSystemByID = defs.fishForMetadata('w3c-provenance-activity-type');
      expect(w3cProvenanceCodeSystemByID).toEqual({
        id: 'w3c-provenance-activity-type',
        name: 'W3cProvenanceActivityType',
        url: 'http://hl7.org/fhir/w3c-provenance-activity-type',
        version: '4.0.1',
        resourceType: 'CodeSystem',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'CodeSystem-w3c-provenance-activity-type.json')}`
      });
      expect(defs.fishForMetadata('W3cProvenanceActivityType')).toEqual(
        w3cProvenanceCodeSystemByID
      );
      expect(defs.fishForMetadata('http://hl7.org/fhir/w3c-provenance-activity-type')).toEqual(
        w3cProvenanceCodeSystemByID
      );

      const eLTSSServiceModelByID = defs.fishForMetadata('eLTSSServiceModel');
      expect(eLTSSServiceModelByID).toEqual({
        abstract: false,
        id: 'eLTSSServiceModel',
        name: 'ELTSSServiceModel',
        parent: 'http://hl7.org/fhir/StructureDefinition/Element',
        sdType: 'eLTSSServiceModel',
        url: 'http://hl7.org/fhir/us/eltss/StructureDefinition/eLTSSServiceModel',
        version: '0.1.0',
        resourceType: 'StructureDefinition',
        canBeTarget: false,
        canBind: false,
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-eLTSSServiceModel.json')}`
      });
      expect(defs.fishForMetadata('ELTSSServiceModel')).toEqual(eLTSSServiceModelByID);
      expect(
        defs.fishForMetadata('http://hl7.org/fhir/us/eltss/StructureDefinition/eLTSSServiceModel')
      ).toEqual(eLTSSServiceModelByID);

      const individualGenderSearchParamByID = defs.fishForMetadata('individual-gender');
      expect(individualGenderSearchParamByID).toEqual({
        id: 'individual-gender',
        name: 'gender',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'SearchParameter-individual-gender.json')}`,
        resourceType: 'SearchParameter',
        url: 'http://hl7.org/fhir/SearchParameter/individual-gender',
        version: '4.0.1'
      });
      expect(defs.fishForMetadata('gender')).toEqual(individualGenderSearchParamByID);
      expect(defs.fishForMetadata('http://hl7.org/fhir/SearchParameter/individual-gender')).toEqual(
        individualGenderSearchParamByID
      );
    });

    it('should find logical models with the can-bind type characteristic extension', () => {
      const bindableLMById = defs.fishForMetadata('BindableLM', Type.Logical);
      expect(bindableLMById).toEqual({
        abstract: false,
        id: 'BindableLM',
        name: 'BindableLM',
        sdType: 'http://example.org/StructureDefinition/BindableLM',
        url: 'http://example.org/StructureDefinition/BindableLM',
        parent: 'http://hl7.org/fhir/StructureDefinition/Base',
        resourceType: 'StructureDefinition',
        canBeTarget: false,
        canBind: true, // BindableLM has can-bind type-characteristics extension
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-BindableLM.json')}`
      });
      expect(
        defs.fishForMetadata('http://example.org/StructureDefinition/BindableLM', Type.Logical)
      ).toEqual(bindableLMById);
    });
  });

  describe('#fishForMetadatas', () => {
    it('should return all matches when there are multiple matches', () => {
      const allergyStatusValueSetByID = defs.fishForMetadatas(
        'allergyintolerance-clinical',
        Type.ValueSet,
        Type.CodeSystem
      );
      expect(allergyStatusValueSetByID).toEqual([
        {
          id: 'allergyintolerance-clinical',
          name: 'AllergyIntoleranceClinicalStatusCodes',
          url: 'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical',
          version: '4.0.1',
          resourceType: 'ValueSet',
          resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'ValueSet-allergyintolerance-clinical.json')}`
        },
        {
          id: 'allergyintolerance-clinical',
          name: 'AllergyIntoleranceClinicalStatusCodes',
          url: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          version: '4.0.1',
          resourceType: 'CodeSystem',
          resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'CodeSystem-allergyintolerance-clinical.json')}`
        }
      ]);
      expect(
        defs.fishForMetadatas(
          'AllergyIntoleranceClinicalStatusCodes',
          Type.ValueSet,
          Type.CodeSystem
        )
      ).toEqual(allergyStatusValueSetByID);
      expect(
        defs.fishForMetadatas(
          'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical',
          Type.ValueSet,
          Type.CodeSystem
        )
      ).toEqual(allergyStatusValueSetByID.slice(0, 1));
      expect(
        defs.fishForMetadatas(
          'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical',
          Type.ValueSet,
          Type.CodeSystem
        )
      ).toEqual(allergyStatusValueSetByID.slice(1, 2));
    });

    it('should return one match when there is a single match', () => {
      const conditionByID = defs.fishForMetadatas('Condition', Type.Resource);
      expect(conditionByID).toHaveLength(1);
      expect(conditionByID[0]).toEqual({
        abstract: false,
        id: 'Condition',
        name: 'Condition',
        sdType: 'Condition',
        url: 'http://hl7.org/fhir/StructureDefinition/Condition',
        version: '4.0.1',
        parent: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
        resourceType: 'StructureDefinition',
        resourcePath: `virtual:hl7.fhir.r4.core#4.0.1:${testDefsPath('r4-definitions', 'package', 'StructureDefinition-Condition.json')}`
      });
      expect(
        defs.fishForMetadatas('http://hl7.org/fhir/StructureDefinition/Condition', Type.Resource)
      ).toEqual(conditionByID);
    });

    it('should return empty array when there are no matches', () => {
      const packageMetadatas = defs.fishForMetadatas('NonExistentThing');
      expect(packageMetadatas).toBeEmpty();
    });
  });

  describe('#allPredefinedResources', () => {
    it('should return all predefined resources', () => {
      const results = defs.allPredefinedResources();
      expect(results).toEqual([
        expect.objectContaining({
          resourceType: 'StructureDefinition',
          id: 'my-predefined-profile'
        }),
        expect.objectContaining({
          resourceType: 'ValueSet',
          id: 'some-codes'
        }),
        expect.objectContaining({
          resourceType: 'CodeSystem',
          id: 'some-codes'
        })
      ]);
    });
  });

  describe('#fishForPredefinedResource', () => {
    it('should find a matching predefined resource', () => {
      const result = defs.fishForPredefinedResource('MyPredefinedProfile');
      expect(result).toMatchObject({
        resourceType: 'StructureDefinition',
        id: 'my-predefined-profile'
      });
      // Check snapshot just to confirm it's really the full JSON, not just metadata
      expect(result.snapshot).toBeDefined();
      expect(defs.fishForPredefinedResource('my-predefined-profile')).toEqual(result);
      expect(
        defs.fishForPredefinedResource(
          'http://example.com/StructureDefinition/my-predefined-profile'
        )
      ).toEqual(result);
    });

    it('should return undefined when there is no match', () => {
      const result = defs.fishForPredefinedResource('NonExistentItem');
      expect(result).toBeUndefined();
    });
  });

  describe('#fishForPredefinedResourceMetadata', () => {
    it('should find metadata for a matching predefined resource', () => {
      const result = defs.fishForPredefinedResourceMetadata('MyPredefinedProfile');
      expect(result).toEqual({
        resourceType: 'StructureDefinition',
        id: 'my-predefined-profile',
        name: 'MyPredefinedProfile',
        url: 'http://example.com/StructureDefinition/my-predefined-profile',
        abstract: false,
        resourcePath: 'virtual:sushi-local#LOCAL:my-predefined-profile'
      });
      expect(defs.fishForPredefinedResourceMetadata('my-predefined-profile')).toEqual(result);
      expect(
        defs.fishForPredefinedResourceMetadata(
          'http://example.com/StructureDefinition/my-predefined-profile'
        )
      ).toEqual(result);
    });

    it('should return undefined when there is no match', () => {
      const result = defs.fishForPredefinedResourceMetadata('NonExistentItem');
      expect(result).toBeUndefined();
    });
  });

  describe('#fishForPredefinedResourceMetadatas', () => {
    it('should return all matches when there are multiple matches', () => {
      const results = defs.fishForPredefinedResourceMetadatas('SomeCodes');
      expect(results).toHaveLength(2);
      expect(results).toEqual([
        {
          resourceType: 'ValueSet',
          id: 'some-codes',
          name: 'SomeCodes',
          url: 'http://example.com/ValueSet/some-codes',
          resourcePath: 'virtual:sushi-local#LOCAL:some-codes-vs'
        },
        {
          resourceType: 'CodeSystem',
          id: 'some-codes',
          name: 'SomeCodes',
          url: 'http://example.com/CodeSystem/some-codes',
          resourcePath: 'virtual:sushi-local#LOCAL:some-codes-cs'
        }
      ]);
      expect(defs.fishForPredefinedResourceMetadatas('some-codes')).toEqual(results);
      expect(
        defs.fishForPredefinedResourceMetadatas('http://example.com/ValueSet/some-codes')
      ).toEqual(results.slice(0, 1));
      expect(
        defs.fishForPredefinedResourceMetadatas('http://example.com/CodeSystem/some-codes')
      ).toEqual(results.slice(1, 2));
    });

    it('should return one match when there is a single match', () => {
      const results = defs.fishForPredefinedResourceMetadatas('MyPredefinedProfile');
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        resourceType: 'StructureDefinition',
        id: 'my-predefined-profile',
        name: 'MyPredefinedProfile',
        url: 'http://example.com/StructureDefinition/my-predefined-profile',
        abstract: false,
        resourcePath: 'virtual:sushi-local#LOCAL:my-predefined-profile'
      });
      expect(defs.fishForPredefinedResourceMetadatas('my-predefined-profile')).toEqual(results);
      expect(
        defs.fishForPredefinedResourceMetadatas(
          'http://example.com/StructureDefinition/my-predefined-profile'
        )
      ).toEqual(results);
    });

    it('should return empty array when there is no match', () => {
      const results = defs.fishForPredefinedResourceMetadatas('NonExistentItem');
      expect(results).toBeEmpty();
    });
  });

  describe('#loadSupplementalFHIRPackage()', () => {
    let testDefs: FHIRDefinitions;
    let supplementalFHIRDefinitionsFactoryMock: jest.Mock;

    beforeEach(async () => {
      supplementalFHIRDefinitionsFactoryMock = jest.fn().mockImplementation(async () => {
        // We don't want the supplemental loader making real network calls or accessing the FHIR cache
        const testDefs = new TestFHIRDefinitions(true);
        await testDefs.initialize();
        return testDefs;
      });
      testDefs = await createFHIRDefinitions(false, supplementalFHIRDefinitionsFactoryMock);
      loggerSpy.reset();
    });

    it('should load specified supplemental FHIR version', async () => {
      await testDefs.loadSupplementalFHIRPackage('hl7.fhir.r3.core#3.0.2');
      expect(testDefs.supplementalFHIRPackages).toEqual(['hl7.fhir.r3.core#3.0.2']);
      expect(testDefs.isSupplementalFHIRDefinitions).toBeFalsy();
      expect(loggerSpy.getAllLogs('error')).toHaveLength(0);
    });

    it('should load multiple supplemental FHIR versions', async () => {
      const promises = [
        'hl7.fhir.r2.core#1.0.2',
        'hl7.fhir.r3.core#3.0.2',
        'hl7.fhir.r5.core#5.0.0'
      ].map(version => {
        return testDefs.loadSupplementalFHIRPackage(version);
      });
      await Promise.all(promises);
      expect(testDefs.supplementalFHIRPackages).toEqual([
        'hl7.fhir.r2.core#1.0.2',
        'hl7.fhir.r3.core#3.0.2',
        'hl7.fhir.r5.core#5.0.0'
      ]);
      expect(defs.isSupplementalFHIRDefinitions).toBeFalsy();
      expect(loggerSpy.getAllLogs('error')).toHaveLength(0);
    });

    it('should log an error when it fails to load a FHIR version', async () => {
      supplementalFHIRDefinitionsFactoryMock.mockReset().mockImplementation(async () => {
        const supplementalDefs = new TestFHIRDefinitions(true);
        await supplementalDefs.initialize();
        const loadSpy = jest.spyOn(supplementalDefs, 'loadPackage');
        loadSpy.mockRejectedValue(new Error());
        return supplementalDefs;
      });
      await testDefs.loadSupplementalFHIRPackage('hl7.fhir.r999.core#999.9.9');
      expect(testDefs.supplementalFHIRPackages).toHaveLength(0);
      expect(testDefs.isSupplementalFHIRDefinitions).toBeFalsy();
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Failed to load supplemental FHIR package hl7\.fhir\.r999\.core#999.9.9/s
      );
    });
  });

  describe('#supplementalFHIRPackages', () => {
    it('should list no supplemental FHIR packages when none have been loaded', async () => {
      const defs = await getTestFHIRDefinitions();
      expect(defs.supplementalFHIRPackages).toEqual([]);
    });

    it('should loaded multiple supplemental FHIR packages', async () => {
      const defs = await createFHIRDefinitions();
      const r3 = await createFHIRDefinitions(true);
      const r5 = await createFHIRDefinitions(true);
      defs.addSupplementalFHIRDefinitions('hl7.fhir.r3.core#3.0.2', r3);
      defs.addSupplementalFHIRDefinitions('hl7.fhir.r5.core#5.0.0', r5);
      expect(defs.supplementalFHIRPackages).toEqual([
        'hl7.fhir.r3.core#3.0.2',
        'hl7.fhir.r5.core#5.0.0'
      ]);
    });
  });
});
