import axios from 'axios';
import fs from 'fs-extra';
import path from 'path';
import temp from 'temp';
import { minimalConfig } from './minimalConfig';
import { loggerSpy } from '../testhelpers/loggerSpy';
import readlineSync from 'readline-sync';
import {
  isSupportedFHIRVersion,
  ensureInputDir,
  findInputDir,
  ensureOutputDir,
  readConfig,
  loadExternalDependencies,
  getRawFSHes,
  hasFshFiles,
  writeFHIRResources,
  init
} from '../../src/utils/Processing';
import * as loadModule from '../../src/fhirdefs/load';
import { FHIRDefinitions } from '../../src/fhirdefs';
import { Package } from '../../src/export';
import { StructureDefinition, ValueSet, CodeSystem, InstanceDefinition } from '../../src/fhirtypes';
import { PackageLoadError } from '../../src/errors';
import { cloneDeep } from 'lodash';
describe('Processing', () => {
  temp.track();

  describe('#isSupportedFHIRVersion', () => {
    it('should support published version >= 4.0.1', () => {
      expect(isSupportedFHIRVersion('4.0.1')).toBe(true);
      expect(isSupportedFHIRVersion('4.2.0')).toBe(true);
      expect(isSupportedFHIRVersion('4.4.0')).toBe(true);
      expect(isSupportedFHIRVersion('4.5.0')).toBe(true);
    });

    it('should support current version', () => {
      expect(isSupportedFHIRVersion('current')).toBe(true);
    });

    it('should not support published versions < 4.0.1', () => {
      expect(isSupportedFHIRVersion('4.0.0')).toBe(false);
      expect(isSupportedFHIRVersion('3.0.2')).toBe(false);
      expect(isSupportedFHIRVersion('1.0.2')).toBe(false);
      expect(isSupportedFHIRVersion('0.0.82')).toBe(false);
    });
  });

  describe('#findInputDir()', () => {
    let tempRoot: string;

    beforeAll(() => {
      tempRoot = temp.mkdirSync('sushi-test');
      fs.mkdirpSync(path.join(tempRoot, 'has-fsh', 'fsh')); // TODO: Tests legacy support. Remove when no longer supported.
      fs.mkdirpSync(path.join(tempRoot, 'has-input-fsh', 'input', 'fsh'));
      fs.mkdirpSync(path.join(tempRoot, 'has-input', 'input'));
      fs.mkdirpSync(path.join(tempRoot, 'has-fsh-and-input-fsh', 'fsh')); // TODO: Tests legacy support. Remove when no longer supported.
      fs.mkdirpSync(path.join(tempRoot, 'has-fsh-and-input-fsh', 'input', 'fsh'));
      fs.mkdirpSync(path.join(tempRoot, 'flat-tank', 'ig-data'));
      fs.mkdirSync(path.join(tempRoot, 'no-fsh'));
      fs.ensureFileSync(path.join(tempRoot, 'no-fsh', 'notfsh.txt'));
    });

    beforeEach(() => {
      loggerSpy.reset();
    });

    afterAll(() => {
      temp.cleanupSync();
    });

    it('should find a path to the current working directory when no input folder is specified', () => {
      const foundInput = ensureInputDir(undefined);
      expect(foundInput).toBe('.');
    });

    // TODO: Tests legacy support. Remove when no longer supported.
    it('should find a path to the fsh subdirectory if present', () => {
      const input = path.join(tempRoot, 'has-fsh');
      const foundInput = findInputDir(input);
      expect(foundInput).toBe(path.join(tempRoot, 'has-fsh', 'fsh'));
      expect(loggerSpy.getLastMessage('warn')).toMatch(
        /Use of this folder is DEPRECATED and will be REMOVED in a future release/s
      );
    });

    it('should find a path to the input/fsh subdirectory if present', () => {
      const input = path.join(tempRoot, 'has-input-fsh');
      const foundInput = findInputDir(input);
      expect(foundInput).toBe(path.join(tempRoot, 'has-input-fsh', 'input', 'fsh'));
    });

    it('should use path to input/fsh as input if input/ subdirectory present but no input/fsh present', () => {
      const input = path.join(tempRoot, 'has-input');
      const foundInput = findInputDir(input);
      expect(foundInput).toBe(path.join(tempRoot, 'has-input', 'input', 'fsh'));
      expect(loggerSpy.getAllMessages()).toHaveLength(0);
    });

    // TODO: Tests legacy support. Remove when no longer supported.
    it('should prefer path to input/fsh over fsh/ if both present', () => {
      const input = path.join(tempRoot, 'has-fsh-and-input-fsh');
      const foundInput = findInputDir(input);
      expect(foundInput).toBe(path.join(tempRoot, 'has-fsh-and-input-fsh', 'input', 'fsh'));
    });

    it('should find a path to the provided directory if the fsh subdirectory is not present and a root ig-data is present (legacy flat tank)', () => {
      const input = path.join(tempRoot, 'flat-tank');
      const foundInput = findInputDir(input);
      expect(foundInput).toBe(input);
    });

    it('should find a path to input/fsh if no fsh files are present, no root level ig-data folder, and no fsh subdirectory (current tank with no fsh files)', () => {
      const input = path.join(tempRoot, 'no-fsh');
      const foundInput = findInputDir(input);
      expect(foundInput).toBe(path.join(tempRoot, 'no-fsh', 'input', 'fsh'));
    });
  });

  describe('#ensureOutputDir()', () => {
    let tempRoot: string;
    let emptyDirSpy: jest.SpyInstance;

    beforeAll(() => {
      tempRoot = temp.mkdirSync('sushi-test');
      fs.mkdirSync(path.join(tempRoot, 'my-input'));
    });

    beforeEach(() => {
      emptyDirSpy = jest.spyOn(fs, 'emptyDirSync').mockImplementation(() => '');
      emptyDirSpy.mockReset();
    });

    afterAll(() => {
      temp.cleanupSync();
    });

    it('should use and create the output directory when it is provided', () => {
      const input = path.join(tempRoot, 'my-input');
      const output = path.join(tempRoot, 'my-output');
      const legacyIgContextOutputDir = ensureOutputDir(input, output, false, true);
      const igContextOutputDir = ensureOutputDir(input, output, true, false);
      const nonIgContextOutputDir = ensureOutputDir(input, output, false, false);
      expect(igContextOutputDir).toBe(output);
      expect(nonIgContextOutputDir).toBe(output);
      expect(legacyIgContextOutputDir).toBe(output);
      expect(fs.existsSync(output)).toBeTruthy();
    });

    it('should default the output directory to "build" when not running in IG Publisher context', () => {
      const input = path.join(tempRoot, 'my-input');
      const outputDir = ensureOutputDir(input, undefined, false, false);
      expect(outputDir).toBe('build');
      expect(fs.existsSync(outputDir)).toBeTruthy();
    });

    it('should default the output directory to the parent of the input when running in legacy IG Publisher context', () => {
      const input = path.join(tempRoot, 'my-input');
      const outputDir = ensureOutputDir(input, undefined, false, true);
      expect(outputDir).toBe(tempRoot);
      expect(fs.existsSync(outputDir)).toBeTruthy();
    });

    it('should default the output directory to the grandparent of the input when running in IG Publisher context', () => {
      const input = path.join(tempRoot, 'my-input', 'my-fsh');
      const outputDir = ensureOutputDir(input, undefined, true, false);
      expect(outputDir).toBe(tempRoot);
      expect(fs.existsSync(outputDir)).toBeTruthy();
    });

    it('should empty the fsh-generated folder if the output directory contains one', () => {
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementationOnce(dir => dir === path.join(tempRoot, 'fsh-generated'));
      const input = path.join(tempRoot, 'my-input', 'my-fsh');
      const outputDir = ensureOutputDir(input, undefined, true, false);
      expect(outputDir).toBe(tempRoot);
      expect(fs.existsSync(outputDir)).toBeTruthy();
      expect(emptyDirSpy.mock.calls).toHaveLength(1);
      expect(emptyDirSpy.mock.calls[0][0]).toBe(path.join(tempRoot, 'fsh-generated'));
    });

    it('should log an error when emptying the directory fails', () => {
      emptyDirSpy = emptyDirSpy.mockImplementation(() => {
        throw Error('foo');
      });
      jest
        .spyOn(fs, 'existsSync')
        .mockImplementationOnce(dir => dir === path.join(tempRoot, 'fsh-generated'));
      const input = path.join(tempRoot, 'my-input', 'my-fsh');
      const outputDir = ensureOutputDir(input, undefined, true, false);
      expect(outputDir).toBe(tempRoot);
      expect(fs.existsSync(outputDir)).toBeTruthy();
      expect(emptyDirSpy.mock.calls).toHaveLength(1);
      expect(emptyDirSpy.mock.calls[0][0]).toBe(path.join(tempRoot, 'fsh-generated'));
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /Unable to empty existing fsh-generated folder.*: foo/
      );
    });
  });

  describe('#readConfig()', () => {
    beforeEach(() => {
      loggerSpy.reset();
    });

    it('should return the contents of sushi-config.yaml from the input directory', () => {
      const input = path.join(__dirname, 'fixtures', 'valid-yaml');
      const config = readConfig(input, false);
      expect(config).toEqual({
        filePath: path.join(__dirname, 'fixtures', 'valid-yaml', 'sushi-config.yaml'),
        id: 'sushi-test',
        packageId: 'sushi-test',
        canonical: 'http://hl7.org/fhir/sushi-test',
        url: 'http://hl7.org/fhir/sushi-test/ImplementationGuide/sushi-test',
        version: '0.1.0',
        name: 'FSHTestIG',
        title: 'FSH Test IG',
        status: 'active',
        contact: [
          {
            name: 'Bill Cod',
            telecom: [
              { system: 'url', value: 'https://capecodfishermen.org/' },
              { system: 'email', value: 'cod@reef.gov' }
            ]
          }
        ],
        description: 'Provides a simple example of how FSH can be used to create an IG',
        license: 'CC0-1.0',
        fhirVersion: ['4.0.1'],
        dependencies: [
          { packageId: 'hl7.fhir.us.core', version: '3.1.0' },
          { packageId: 'hl7.fhir.uv.vhdir', version: 'current' }
        ],
        FSHOnly: false,
        applyExtensionMetadataToRoot: true,
        parameters: [
          {
            code: 'copyrightyear',
            value: '2020'
          },
          {
            code: 'releaselabel',
            value: 'CI Build'
          }
        ]
      });
    });

    it('should allow FHIR R5', () => {
      const input = path.join(__dirname, 'fixtures', 'fhir-r5');
      const config = readConfig(input, false);
      expect(config.fhirVersion).toEqual(['4.5.0']);
    });

    it('should allow FHIR current', () => {
      const input = path.join(__dirname, 'fixtures', 'fhir-current');
      const config = readConfig(input, false);
      expect(config.fhirVersion).toEqual(['current']);
    });

    it('should extract a configuration from an ImplementationGuide JSON when config.yaml is absent', () => {
      const input = path.join(__dirname, 'fixtures', 'ig-JSON-only');
      const config = readConfig(input, false);
      expect(config).toEqual({
        FSHOnly: true,
        canonical: 'http://example.org',
        fhirVersion: ['4.0.1']
      });
    });

    it('should extract a configuration from an ImplementationGuide JSON when config.yaml is absent (legacy)', () => {
      const input = path.join(__dirname, 'fixtures', 'ig-JSON-only-legacy', 'fsh');
      const config = readConfig(input, true);
      expect(config).toEqual({
        FSHOnly: true,
        canonical: 'http://example.org',
        fhirVersion: ['4.0.1']
      });
    });

    it('should log and throw an error when sushi-config.yaml is not found in the input directory', () => {
      const input = path.join(__dirname, 'fixtures', 'no-package');
      expect(() => {
        readConfig(input, false);
      }).toThrow();
      expect(loggerSpy.getLastMessage('error')).toMatch(/No sushi-config\.yaml/s);
    });

    it('should log and throw an error when the contents of sushi-config.yaml are not valid yaml', () => {
      const input = path.join(__dirname, 'fixtures', 'invalid-yaml');
      expect(() => {
        readConfig(input, false);
      }).toThrow();
      expect(loggerSpy.getLastMessage('error')).toMatch(/not a valid YAML object/s);
    });

    it('should log and throw an error when the configuration uses an unsupported FHIR version (DSTU2)', () => {
      const input = path.join(__dirname, 'fixtures', 'fhir-dstu2');
      expect(() => {
        readConfig(input, false);
      }).toThrow();
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /must specify a supported version of FHIR/s
      );
    });

    it('should log and throw an error when the configuration uses an unsupported FHIR version (4.0.0)', () => {
      const input = path.join(__dirname, 'fixtures', 'fhir-four-oh-oh');
      expect(() => {
        readConfig(input, false);
      }).toThrow();
      expect(loggerSpy.getLastMessage('error')).toMatch(
        /must specify a supported version of FHIR/s
      );
    });
  });

  describe('#loadExternalDependencies()', () => {
    beforeAll(() => {
      jest
        .spyOn(loadModule, 'loadDependency')
        .mockImplementation(
          async (packageName: string, version: string, FHIRDefs: FHIRDefinitions) => {
            // the mock loader can find hl7.fhir.r4.core, hl7.fhir.r5.core, and hl7.fhir.us.core
            if (
              packageName === 'hl7.fhir.r4.core' ||
              packageName === 'hl7.fhir.r5.core' ||
              packageName === 'hl7.fhir.us.core'
            ) {
              FHIRDefs.packages.push(`${packageName}#${version}`);
              return Promise.resolve(FHIRDefs);
            } else {
              throw new PackageLoadError(`${packageName}#${version}`);
            }
          }
        );
    });
    beforeEach(() => {
      loggerSpy.reset();
    });

    it('should load specified dependencies', () => {
      const usCoreDependencyConfig = cloneDeep(minimalConfig);
      usCoreDependencyConfig.dependencies = [{ packageId: 'hl7.fhir.us.core', version: '3.1.0' }];
      const defs = new FHIRDefinitions();
      const dependencyDefs = loadExternalDependencies(defs, usCoreDependencyConfig);
      return Promise.all(dependencyDefs).then(() => {
        expect(defs.packages.length).toBe(2);
        expect(defs.packages).toContain('hl7.fhir.r4.core#4.0.1');
        expect(defs.packages).toContain('hl7.fhir.us.core#3.1.0');
        expect(loggerSpy.getAllLogs('warn')).toHaveLength(0);
      });
    });

    it('should support FHIR R5 dependencies', () => {
      const config = cloneDeep(minimalConfig);
      config.fhirVersion = ['4.5.0'];
      const defs = new FHIRDefinitions();
      const dependencyDefs = loadExternalDependencies(defs, config);
      return Promise.all(dependencyDefs).then(() => {
        expect(defs.packages).toEqual(['hl7.fhir.r5.core#4.5.0']);
        expect(loggerSpy.getLastMessage('warn')).toMatch(
          /support for pre-release versions of FHIR is experimental/s
        );
      });
    });

    it('should support FHIR current dependencies', () => {
      const config = cloneDeep(minimalConfig);
      config.fhirVersion = ['current'];
      const defs = new FHIRDefinitions();
      const dependencyDefs = loadExternalDependencies(defs, config);
      return Promise.all(dependencyDefs).then(() => {
        expect(defs.packages).toEqual(['hl7.fhir.r5.core#current']);
        expect(loggerSpy.getLastMessage('warn')).toMatch(
          /support for pre-release versions of FHIR is experimental/s
        );
      });
    });

    it('should log an error when it fails to load a dependency', () => {
      const badDependencyConfig = cloneDeep(minimalConfig);
      badDependencyConfig.dependencies = [{ packageId: 'hl7.does.not.exist', version: 'current' }];
      const defs = new FHIRDefinitions();
      const dependencyDefs = loadExternalDependencies(defs, badDependencyConfig);
      return Promise.all(dependencyDefs).then(() => {
        expect(defs.packages.length).toBe(1);
        expect(defs.packages).toContain('hl7.fhir.r4.core#4.0.1');
        expect(loggerSpy.getLastMessage('error')).toMatch(
          /Failed to load hl7\.does\.not\.exist#current/s
        );
      });
    });

    it('should log an error when a dependency has no specified version', () => {
      const badDependencyConfig = cloneDeep(minimalConfig);
      badDependencyConfig.dependencies = [{ packageId: 'hl7.fhir.r4.core' }];
      const defs = new FHIRDefinitions();
      const dependencyDefs = loadExternalDependencies(defs, badDependencyConfig);
      return Promise.all(dependencyDefs).then(() => {
        expect(defs.packages.length).toBe(1);
        expect(defs.packages).toContain('hl7.fhir.r4.core#4.0.1');
        expect(loggerSpy.getLastMessage('error')).toMatch(
          /Failed to load hl7\.fhir\.r4\.core: No version specified\./s
        );
      });
    });
  });

  describe('#getRawFSHes()', () => {
    it('should return a RawFSH for each file in the input directory that ends with .fsh', () => {
      const input = path.join(__dirname, 'fixtures', 'fsh-files');
      const rawFSHes = getRawFSHes(input);
      expect(rawFSHes.length).toBe(2);
      expect(rawFSHes).toContainEqual({
        content: '// Content of first file',
        path: path.join(input, 'first.fsh')
      });
      expect(rawFSHes).toContainEqual({
        content: '// Content of second file',
        path: path.join(input, 'second.fsh')
      });
    });

    it('should log and throw an error when the input path is invalid', () => {
      const input = path.join(__dirname, 'fixtures', 'wrong-path');
      expect(() => {
        getRawFSHes(input);
      }).toThrow();
      expect(loggerSpy.getLastMessage('error')).toMatch(/Invalid path to FSH definition folder\./s);
    });
  });

  describe('#hasFshFiles()', () => {
    let tempRoot: string;

    beforeAll(() => {
      tempRoot = temp.mkdirSync('sushi-test');
      fs.mkdirSync(path.join(tempRoot, 'some-fsh'));
      fs.mkdirSync(path.join(tempRoot, 'some-fsh', 'nested'));
      fs.ensureFileSync(path.join(tempRoot, 'some-fsh', 'notfsh.txt'));
      fs.ensureFileSync(path.join(tempRoot, 'some-fsh', 'nested', 'myfsh.fsh'));
      fs.mkdirSync(path.join(tempRoot, 'no-fsh'));
      fs.mkdirSync(path.join(tempRoot, 'no-fsh', 'nested'));
      fs.ensureFileSync(path.join(tempRoot, 'no-fsh', 'notfsh.txt'));
      fs.ensureFileSync(path.join(tempRoot, 'no-fsh', 'nested', 'notfsh.txt'));
    });

    afterAll(() => {
      temp.cleanupSync();
    });

    it('should return true if FSH files exist in any subdirectory', () => {
      const result = hasFshFiles(path.join(tempRoot, 'some-fsh'));
      expect(result).toBe(true);
    });

    it('should return false if there are no FSH files in any subdirectory', () => {
      const result = hasFshFiles(path.join(tempRoot, 'no-fsh'));
      expect(result).toBe(false);
    });
  });

  describe('#writeFHIRResources()', () => {
    let tempRoot: string;
    let tempIGPubRoot: string;
    let outPackage: Package;
    let defs: FHIRDefinitions;

    beforeAll(() => {
      tempRoot = temp.mkdirSync('output-dir');
      tempIGPubRoot = temp.mkdirSync('output-ig-dir');
      const input = path.join(__dirname, 'fixtures', 'valid-yaml');
      const config = readConfig(input, false);
      outPackage = new Package(config);
      defs = new FHIRDefinitions();

      const myProfile = new StructureDefinition();
      myProfile.id = 'my-profile';
      const myExtension = new StructureDefinition();
      myExtension.id = 'my-extension';
      const myValueSet = new ValueSet();
      myValueSet.id = 'my-value-set';
      const myCodeSystem = new CodeSystem();
      myCodeSystem.id = 'my-code-system';

      const myInlineInstance = new InstanceDefinition();
      myInlineInstance.id = 'my-inline-instance';
      myInlineInstance._instanceMeta.usage = 'Inline';
      const myExampleInstance = new InstanceDefinition();
      myExampleInstance.id = 'my-example';
      myExampleInstance.resourceType = 'Observation';
      myExampleInstance._instanceMeta.usage = 'Example';
      const myCapabilityStatement = new InstanceDefinition();
      myCapabilityStatement.id = 'my-capabilities';
      myCapabilityStatement.resourceType = 'CapabilityStatement';
      const myConceptMap = new InstanceDefinition();
      myConceptMap.id = 'my-concept-map';
      myConceptMap.resourceType = 'ConceptMap';
      const myModelInstance = new InstanceDefinition();
      myModelInstance.id = 'my-model';
      myModelInstance.resourceType = 'StructureDefinition';
      myModelInstance.kind = 'logical';
      const myOperationDefinition = new InstanceDefinition();
      myOperationDefinition.id = 'my-operation';
      myOperationDefinition.resourceType = 'OperationDefinition';
      const myExtensionInstance = new InstanceDefinition();
      myExtensionInstance.id = 'my-extension-instance';
      myExtensionInstance.resourceType = 'StructureDefinition';
      myExtensionInstance.kind = 'resource';
      myExtensionInstance.type = 'Extension';
      const myProfileInstance = new InstanceDefinition();
      myProfileInstance.id = 'my-profile-instance';
      myProfileInstance.resourceType = 'StructureDefinition';
      myProfileInstance.kind = 'resource';
      myProfileInstance.type = 'Observation';
      const myOtherInstance = new InstanceDefinition();
      myOtherInstance.id = 'my-other-instance';
      myOtherInstance.resourceType = 'Observation';

      const myPredefinedProfile = new StructureDefinition();
      myPredefinedProfile.id = 'my-duplicate-profile';
      myPredefinedProfile.url = 'http://example.com/StructureDefinition/my-duplicate-profile';
      defs.addPredefinedResource(
        'StructureDefinition-my-duplicate-profile.json',
        myPredefinedProfile
      );
      const myFSHDefinedProfile = new StructureDefinition();
      myFSHDefinedProfile.id = 'my-duplicate-profile';
      myFSHDefinedProfile.url = 'http://example.com/StructureDefinition/my-duplicate-profile';

      const myPredefinedInstance = new InstanceDefinition();
      myPredefinedInstance.id = 'my-duplicate-instance';
      myPredefinedInstance.resourceType = 'Patient';
      defs.addPredefinedResource('Patient-my-duplicate-instance.json', myPredefinedInstance);
      const myFSHDefinedInstance = new InstanceDefinition();
      myFSHDefinedInstance.id = 'my-duplicate-instance';
      myFSHDefinedInstance.resourceType = 'Patient';

      outPackage.profiles.push(myProfile, myFSHDefinedProfile);
      outPackage.extensions.push(myExtension);
      outPackage.valueSets.push(myValueSet);
      outPackage.codeSystems.push(myCodeSystem);
      outPackage.instances.push(
        myInlineInstance,
        myExampleInstance,
        myCapabilityStatement,
        myConceptMap,
        myModelInstance,
        myOperationDefinition,
        myExtensionInstance,
        myProfileInstance,
        myOtherInstance,
        myFSHDefinedInstance
      );
    });

    afterAll(() => {
      temp.cleanupSync();
    });

    describe('IG Publisher mode', () => {
      beforeAll(() => {
        writeFHIRResources(tempIGPubRoot, outPackage, defs, false, true);
      });

      afterAll(() => {
        temp.cleanupSync();
      });

      it('should write all resources to the "fsh-generated/resources" directory', () => {
        const generatedPath = path.join(tempIGPubRoot, 'fsh-generated', 'resources');
        expect(fs.existsSync(generatedPath)).toBeTruthy();
        const allGeneratedFiles = fs.readdirSync(generatedPath);
        expect(allGeneratedFiles.length).toBe(12);
        expect(allGeneratedFiles).toContain('StructureDefinition-my-profile.json');
        expect(allGeneratedFiles).toContain('StructureDefinition-my-profile-instance.json');
        expect(allGeneratedFiles).toContain('StructureDefinition-my-extension.json');
        expect(allGeneratedFiles).toContain('StructureDefinition-my-extension-instance.json');
        expect(allGeneratedFiles).toContain('ValueSet-my-value-set.json');
        expect(allGeneratedFiles).toContain('CodeSystem-my-code-system.json');
        expect(allGeneratedFiles).toContain('ConceptMap-my-concept-map.json');
        expect(allGeneratedFiles).toContain('Observation-my-example.json');
        expect(allGeneratedFiles).toContain('CapabilityStatement-my-capabilities.json');
        expect(allGeneratedFiles).toContain('StructureDefinition-my-model.json');
        expect(allGeneratedFiles).toContain('OperationDefinition-my-operation.json');
        expect(allGeneratedFiles).toContain('Observation-my-other-instance.json');
      });

      it('should not write a resource if that resource already exists in the "input" folder', () => {
        expect(
          fs.existsSync(
            path.join(
              tempIGPubRoot,
              'fsh-generated',
              'resources',
              'StructureDefinition-my-duplicate-profile.json'
            )
          )
        ).toBeFalsy();
        expect(
          loggerSpy
            .getAllMessages('error')
            .some(error => error.match(/Ignoring FSH definition for .*my-duplicate-profile/))
        ).toBeTruthy();
        expect(
          fs.existsSync(
            path.join(
              tempIGPubRoot,
              'fsh-generated',
              'resources',
              'Patient-my-duplicate-instance.json'
            )
          )
        ).toBeFalsy();
        expect(
          loggerSpy
            .getAllMessages('error')
            .some(error => error.match(/Ignoring FSH definition for .*my-duplicate-instance/))
        ).toBeTruthy();
      });
    });

    describe('legacy IG Publisher mode and legacy flat tank', () => {
      beforeAll(() => {
        writeFHIRResources(tempRoot, outPackage, defs, false, false);
      });

      afterAll(() => {
        temp.cleanupSync();
      });

      it('should write profiles and profile instances to the "profiles" directory', () => {
        const profilesPath = path.join(tempRoot, 'input', 'profiles');
        expect(fs.existsSync(profilesPath)).toBeTruthy();
        const profilesFiles = fs.readdirSync(profilesPath);
        expect(profilesFiles.length).toBe(2);
        expect(profilesFiles).toContain('StructureDefinition-my-profile.json');
        expect(profilesFiles).toContain('StructureDefinition-my-profile-instance.json');
      });

      it('should write extensions and extension instances to the "extensions" directory', () => {
        const extensionsPath = path.join(tempRoot, 'input', 'extensions');
        expect(fs.existsSync(extensionsPath)).toBeTruthy();
        const extensionsFiles = fs.readdirSync(extensionsPath);
        expect(extensionsFiles.length).toBe(2);
        expect(extensionsFiles).toContain('StructureDefinition-my-extension.json');
        expect(extensionsFiles).toContain('StructureDefinition-my-extension-instance.json');
      });

      it('should write value sets, code systems, and vocabulary instances to the "vocabulary" directory', () => {
        const vocabularyPath = path.join(tempRoot, 'input', 'vocabulary');
        expect(fs.existsSync(vocabularyPath)).toBeTruthy();
        const vocabularyFiles = fs.readdirSync(vocabularyPath);
        expect(vocabularyFiles.length).toBe(3);
        expect(vocabularyFiles).toContain('ValueSet-my-value-set.json');
        expect(vocabularyFiles).toContain('CodeSystem-my-code-system.json');
        expect(vocabularyFiles).toContain('ConceptMap-my-concept-map.json');
      });

      it('should write example instances to the "examples" directory', () => {
        const examplesPath = path.join(tempRoot, 'input', 'examples');
        expect(fs.existsSync(examplesPath)).toBeTruthy();
        const examplesFiles = fs.readdirSync(examplesPath);
        expect(examplesFiles.length).toBe(1);
        expect(examplesFiles).toContain('Observation-my-example.json');
      });

      it('should write capability instances to the "capabilities" directory', () => {
        const capabilitiesPath = path.join(tempRoot, 'input', 'capabilities');
        expect(fs.existsSync(capabilitiesPath)).toBeTruthy();
        const capabilitiesFiles = fs.readdirSync(capabilitiesPath);
        expect(capabilitiesFiles.length).toBe(1);
        expect(capabilitiesFiles).toContain('CapabilityStatement-my-capabilities.json');
      });

      it('should write model instances to the "models" directory', () => {
        const modelsPath = path.join(tempRoot, 'input', 'models');
        expect(fs.existsSync(modelsPath)).toBeTruthy();
        const modelsFiles = fs.readdirSync(modelsPath);
        expect(modelsFiles.length).toBe(1);
        expect(modelsFiles).toContain('StructureDefinition-my-model.json');
      });

      it('should write operation instances to the "operations" directory', () => {
        const operationsPath = path.join(tempRoot, 'input', 'operations');
        expect(fs.existsSync(operationsPath)).toBeTruthy();
        const operationsFiles = fs.readdirSync(operationsPath);
        expect(operationsFiles.length).toBe(1);
        expect(operationsFiles).toContain('OperationDefinition-my-operation.json');
      });

      it('should write all other non-inline instances to the "resources" directory', () => {
        const resourcesPath = path.join(tempRoot, 'input', 'resources');
        expect(fs.existsSync(resourcesPath)).toBeTruthy();
        const resourcesFiles = fs.readdirSync(resourcesPath);
        expect(resourcesFiles.length).toBe(1);
        expect(resourcesFiles).toContain('Observation-my-other-instance.json');
      });

      it('should write an info message with the number of instances exported', () => {
        expect(loggerSpy.getLastMessage('info')).toMatch(/Exported 12 FHIR resources/s);
      });
    });
  });

  describe('#init()', () => {
    let readlineSpy: jest.SpyInstance;
    let yesNoSpy: jest.SpyInstance;
    let writeSpy: jest.SpyInstance;
    let copyFileSpy: jest.SpyInstance;
    let ensureDirSpy: jest.SpyInstance;
    let consoleSpy: jest.SpyInstance;
    let getSpy: jest.SpyInstance;

    beforeEach(() => {
      readlineSpy = jest.spyOn(readlineSync, 'question').mockImplementation(() => '');
      yesNoSpy = jest.spyOn(readlineSync, 'keyInYN').mockImplementation(() => true);
      writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      copyFileSpy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});
      ensureDirSpy = jest.spyOn(fs, 'ensureDirSync').mockImplementation(() => undefined);
      consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      getSpy = jest.spyOn(axios, 'get').mockImplementation(url => {
        return Promise.resolve({ data: url.slice(url.lastIndexOf('/') + 1) });
      });
      readlineSpy.mockClear();
      yesNoSpy.mockClear();
      writeSpy.mockClear();
      copyFileSpy.mockClear();
      ensureDirSpy.mockClear();
      consoleSpy.mockClear();
      getSpy.mockClear();
    });

    it('should initialize a default project when no user input is given', async () => {
      await init();
      expect(readlineSpy.mock.calls).toEqual([
        ['Name (Default: ExampleIG): '],
        ['Id (Default: fhir.example): '],
        ['Canonical (Default: http://example.org): '],
        ['Status (Default: draft): '],
        ['Version (Default: 0.1.0): ']
      ]);
      expect(yesNoSpy.mock.calls).toHaveLength(1);
      expect(yesNoSpy.mock.calls[0][0]).toMatch(/Initialize SUSHI project in .*ExampleIG/);

      expect(ensureDirSpy.mock.calls).toHaveLength(2);
      expect(ensureDirSpy.mock.calls[0][0]).toMatch(/.*ExampleIG.*input.*pagecontent/);
      expect(ensureDirSpy.mock.calls[1][0]).toMatch(/.*ExampleIG.*input.*fsh/);

      expect(writeSpy.mock.calls).toHaveLength(7);
      expect(writeSpy.mock.calls[0][0]).toMatch(/.*index\.md/);
      expect(writeSpy.mock.calls[0][1]).toMatch(/# ExampleIG/);
      expect(writeSpy.mock.calls[1][0]).toMatch(/.*ig\.ini/);
      expect(writeSpy.mock.calls[1][1]).toMatch(/fhir.example/);
      expect(writeSpy.mock.calls[2][0]).toMatch(/.*sushi-config\.yaml/);
      expect(writeSpy.mock.calls[2][1].replace(/[\n\r]/g, '')).toBe(
        fs
          .readFileSync(
            path.join(__dirname, 'fixtures', 'init-config', 'default-config.yaml'),
            'utf-8'
          )
          .replace(/[\n\r]/g, '')
      );

      expect(copyFileSpy.mock.calls).toHaveLength(3);
      expect(copyFileSpy.mock.calls[0][1]).toMatch(/.*ExampleIG.*fsh.*patient.fsh/);
      expect(copyFileSpy.mock.calls[1][1]).toMatch(/.*ExampleIG.*\.gitignore/);
      expect(copyFileSpy.mock.calls[2][1]).toMatch(/.*ExampleIG.*input.*ignoreWarnings\.txt/);

      expect(getSpy.mock.calls).toHaveLength(4);
      const base = 'http://raw.githubusercontent.com/HL7/ig-publisher-scripts/main/';
      expect(getSpy.mock.calls[0][0]).toBe(base + '_genonce.bat');
      expect(getSpy.mock.calls[1][0]).toBe(base + '_genonce.sh');
      expect(getSpy.mock.calls[2][0]).toBe(base + '_updatePublisher.bat');
      expect(getSpy.mock.calls[3][0]).toBe(base + '_updatePublisher.sh');

      expect(writeSpy.mock.calls[3][0]).toMatch(/.*_genonce\.bat/);
      expect(writeSpy.mock.calls[3][1]).toMatch(/_genonce\.bat/);
      expect(writeSpy.mock.calls[4][0]).toMatch(/.*_genonce\.sh/);
      expect(writeSpy.mock.calls[4][1]).toMatch(/_genonce\.sh/);
      expect(writeSpy.mock.calls[5][0]).toMatch(/.*_updatePublisher\.bat/);
      expect(writeSpy.mock.calls[5][1]).toMatch(/_updatePublisher\.bat/);
      expect(writeSpy.mock.calls[6][0]).toMatch(/.*_updatePublisher\.sh/);
      expect(writeSpy.mock.calls[6][1]).toMatch(/_updatePublisher\.sh/);
    });

    it('should initialize a project with user input', async () => {
      readlineSpy.mockImplementation((question: string) => {
        if (question.startsWith('Name')) {
          return 'MyNonDefaultName';
        } else if (question.startsWith('Id')) {
          return 'foo.bar';
        } else if (question.startsWith('Canonical')) {
          return 'http://foo.com';
        } else if (question.startsWith('Status')) {
          return 'active';
        } else if (question.startsWith('Version')) {
          return '2.0.0';
        }
      });
      await init();
      expect(readlineSpy.mock.calls).toEqual([
        ['Name (Default: ExampleIG): '],
        ['Id (Default: fhir.example): '],
        ['Canonical (Default: http://example.org): '],
        ['Status (Default: draft): '],
        ['Version (Default: 0.1.0): ']
      ]);
      expect(yesNoSpy.mock.calls).toHaveLength(1);
      expect(yesNoSpy.mock.calls[0][0]).toMatch(/Initialize SUSHI project in .*MyNonDefaultName/);

      expect(ensureDirSpy.mock.calls).toHaveLength(2);
      expect(ensureDirSpy.mock.calls[0][0]).toMatch(/.*MyNonDefaultName.*input.*pagecontent/);
      expect(ensureDirSpy.mock.calls[1][0]).toMatch(/.*MyNonDefaultName.*input.*fsh/);

      expect(writeSpy.mock.calls).toHaveLength(7);
      expect(writeSpy.mock.calls[0][0]).toMatch(/.*index\.md/);
      expect(writeSpy.mock.calls[0][1]).toMatch(/# MyNonDefaultName/);
      expect(writeSpy.mock.calls[1][0]).toMatch(/.*ig\.ini/);
      expect(writeSpy.mock.calls[1][1]).toMatch(/foo.bar/);
      expect(writeSpy.mock.calls[2][0]).toMatch(/.*sushi-config\.yaml/);
      expect(writeSpy.mock.calls[2][1].replace(/[\n\r]/g, '')).toBe(
        fs
          .readFileSync(
            path.join(__dirname, 'fixtures', 'init-config', 'user-input-config.yaml'),
            'utf-8'
          )
          .replace(/[\n\r]/g, '')
      );
      expect(copyFileSpy.mock.calls).toHaveLength(3);
      expect(copyFileSpy.mock.calls[0][1]).toMatch(/.*MyNonDefaultName.*fsh.*patient.fsh/);
      expect(copyFileSpy.mock.calls[1][1]).toMatch(/.*MyNonDefaultName.*\.gitignore/);
      expect(copyFileSpy.mock.calls[2][1]).toMatch(
        /.*MyNonDefaultName.*input.*ignoreWarnings\.txt/
      );

      expect(getSpy.mock.calls).toHaveLength(4);
      const base = 'http://raw.githubusercontent.com/HL7/ig-publisher-scripts/main/';
      expect(getSpy.mock.calls[0][0]).toBe(base + '_genonce.bat');
      expect(getSpy.mock.calls[1][0]).toBe(base + '_genonce.sh');
      expect(getSpy.mock.calls[2][0]).toBe(base + '_updatePublisher.bat');
      expect(getSpy.mock.calls[3][0]).toBe(base + '_updatePublisher.sh');

      expect(writeSpy.mock.calls[3][0]).toMatch(/.*_genonce\.bat/);
      expect(writeSpy.mock.calls[3][1]).toMatch(/_genonce\.bat/);
      expect(writeSpy.mock.calls[4][0]).toMatch(/.*_genonce\.sh/);
      expect(writeSpy.mock.calls[4][1]).toMatch(/_genonce\.sh/);
      expect(writeSpy.mock.calls[5][0]).toMatch(/.*_updatePublisher\.bat/);
      expect(writeSpy.mock.calls[5][1]).toMatch(/_updatePublisher\.bat/);
      expect(writeSpy.mock.calls[6][0]).toMatch(/.*_updatePublisher\.sh/);
      expect(writeSpy.mock.calls[6][1]).toMatch(/_updatePublisher\.sh/);
    });

    it('should abort initalizing a project when the user does not confirm', async () => {
      yesNoSpy.mockImplementation(() => false);

      await init();
      expect(readlineSpy.mock.calls).toEqual([
        ['Name (Default: ExampleIG): '],
        ['Id (Default: fhir.example): '],
        ['Canonical (Default: http://example.org): '],
        ['Status (Default: draft): '],
        ['Version (Default: 0.1.0): ']
      ]);
      expect(yesNoSpy.mock.calls).toHaveLength(1);
      expect(yesNoSpy.mock.calls[0][0]).toMatch(/Initialize SUSHI project in .*ExampleIG/);
      expect(ensureDirSpy.mock.calls).toHaveLength(0);
      expect(writeSpy.mock.calls).toHaveLength(0);
      expect(copyFileSpy.mock.calls).toHaveLength(0);
      expect(consoleSpy.mock.calls.slice(-1)[0]).toEqual(['\nAborting Initialization.\n']);
    });
  });
});
