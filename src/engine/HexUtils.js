import { HexUtils as HexUtilsBase } from 'react-hexgrid';
import Unit from './Unit';
import Kingdom from './Kingdom';
import Tree from './Tree';

export default class HexUtils extends HexUtilsBase {
    static neighboursHexs(world, hex) {
        return this
            .neighbours(hex)
            .map(neighbourCoords => world.getHexAt(neighbourCoords))
            .filter(hex => hex !== undefined)
        ;
    }

    static neighboursHexsSamePlayer(world, hex) {
        return this
            .neighboursHexs(world, hex)
            .filter(neighbourHex => neighbourHex.player === hex.player)
        ;
    }

    static getAllAdjacentHexs(world, originHex) {
        world.hexs.forEach(hex => hex._adjacent = false);

        const flagAdjacents = hex => {
            hex._adjacent = true;

            this.neighboursHexsSamePlayer(world, hex)
                .forEach(hex => {
                    if (hex._adjacent) {
                        return;
                    }

                    hex._adjacent = true;
                    flagAdjacents(hex);
                })
            ;
        }

        flagAdjacents(originHex);

        const adjacentHexs = world.hexs.filter(hex => hex._adjacent);

        world.hexs.forEach(hex => delete hex._adjacent);

        return adjacentHexs;
    }

    static isHexAdjacentKingdom(world, hex, kingdom) {
        if (null !== hex.kingdom && hex.kingdom === kingdom) {
            return false;
        }

        return this.neighboursHexs(world, hex).some(hex => hex.kingdom === kingdom);
    }

    static mergeKingdomsOnCapture(world, lastCapturedHex) {
        const capturingKingdom = lastCapturedHex.kingdom;
        const capturingPlayer = capturingKingdom.player;

        const singleHexs = [];
        const alliedKingdoms = [capturingKingdom];

        this.neighboursHexs(world, lastCapturedHex).forEach(hex => {
            if (null === hex.kingdom) {
                if (hex.player === capturingPlayer) {
                    singleHexs.push(hex);
                }
            } else {
                if (hex.kingdom !== capturingKingdom) {
                    if (hex.kingdom.player === capturingPlayer) {
                        alliedKingdoms.push(hex.kingdom);
                    }
                }
            }
        });

        let widestKingdom = alliedKingdoms[0];

        if (alliedKingdoms.length > 1) {
            alliedKingdoms.forEach(kingdom => {
                if (kingdom.hexs.length > widestKingdom.hexs.length) {
                    widestKingdom = kingdom;
                }
            });

            alliedKingdoms.forEach(alliedKingdom => {
                if (alliedKingdom === widestKingdom) {
                    return;
                }

                alliedKingdom.hexs.forEach(hex => {
                    hex.kingdom = widestKingdom;
                    widestKingdom.hexs.push(hex);
                });

                widestKingdom.money += alliedKingdom.money;
                alliedKingdom.money = 0;
                world.kingdoms = world.kingdoms.filter(worldKingdom => worldKingdom !== alliedKingdom);
            });
        }

        singleHexs.forEach(hex => {
            hex.kingdom = widestKingdom;
            widestKingdom.hexs.push(hex);
        });
    }

    /**
     * @param {World} world
     * @param {Hex} lastCapturedHex
     *
     * @returns {boolean} Wether a kingdom has been cut or not
     */
    static splitKingdomsOnCapture(world, lastCapturedHex) {
        return this.neighboursHexs(world, lastCapturedHex)
            .filter(neighboursHex => neighboursHex.kingdom !== null)
            .filter(neighboursHex => neighboursHex.kingdom !== lastCapturedHex.kingdom)
            .some(opponentHex => this.splitKingdom(world, opponentHex.kingdom))
        ;
    }

    /**
     * @param {World} world
     * @param {Kingdom} kingdom
     *
     * @returns {boolean} Wether kingdom has been cut or not
     */
    static splitKingdom(world, kingdom) {
        if (this.getAllAdjacentHexs(world, kingdom.hexs[0]).length === kingdom.getSize()) {
            return false;
        }

        let kingdomHexs = kingdom.hexs.slice();

        const subKingdoms = [];
        const singleHexs = [];
        const splittedKingdoms = [];

        // Calculate all kingdom fragments
        while (kingdomHexs.length > 0) {
            let subKingdom = this.getAllAdjacentHexs(world, kingdomHexs[0]);

            if (1 === subKingdom.length) {
                singleHexs.push(subKingdom[0]);
            } else {
                subKingdoms.push(subKingdom);
            }

            kingdomHexs = kingdomHexs.filter(hex => -1 === subKingdom.indexOf(hex));
        }

        // Put the widest kingdom at first
        subKingdoms.sort((subKingdomA, subKingdomB) => {
            return subKingdomB.length > subKingdomA;
        });

        // Single hexs created by cutting have no longer kingdom
        singleHexs.forEach(singleHex => singleHex.kingdom = null);

        // Create new kingdoms with a new economy
        subKingdoms.slice(1).forEach(subKingdom => {
            const splittedKingdom = new Kingdom(subKingdom);

            splittedKingdom.money = Math.round(kingdom.money * (subKingdom.length / kingdom.getSize()));
            splittedKingdoms.push(splittedKingdom);
        });

        // Truncate cut hexs from main kingdom (if the main kingdom has not been slashed)
        if (subKingdoms.length > 0) {
            kingdom.hexs = kingdom.hexs.filter(hex => -1 !== subKingdoms[0].indexOf(hex));
        } else {
            world.removeKingdom(kingdom);
        }

        // Add news kingdoms to world and remove extra money from main kingdom to fragmented ones
        splittedKingdoms.forEach(splittedKingdom => {
            kingdom.money -= splittedKingdom.money;
            world.kingdoms.push(splittedKingdom);
        });

        return true;
    }

    static getKingdomIncome(kingdom) {
        return kingdom.hexs
            .filter(hex => !hex.hasTree())
            .filter(hex => !hex.hasDied())
            .length
        ;
    }

    static getKingdomMaintenanceCost(kingdom) {
        let cost = 0;

        kingdom.hexs.forEach(hex => {
            if (hex.entity instanceof Unit) {
                cost += this.getUnitMaintenanceCost(hex.entity);
            }
        });

        return cost;
    }

    static getUnitMaintenanceCost(unit) {
        return 2 * (3 ** (unit.level - 1));
    }

    /**
     * Returns all units that can be an obstacle
     * when capturing a hex.
     *
     * @param {World} world
     * @param {Hex} hex
     * @param {integer} level Optional, Level of unit who want to capture hex
     *
     * @returns {Unit[]} Protecting units, from the strongest to the weakest.
     */
    static getProtectingUnits(world, hex, level) {
        const protectingUnits = [];

        this.neighboursHexsSamePlayer(world, hex)
            .concat([hex])
            .forEach(hex => {
                if (hex.hasUnit()) {
                    protectingUnits.push(hex.entity);
                }
            })
        ;

        protectingUnits.sort((unitA, unitB) => {
            return unitA.level < unitB.level;
        });

        if (undefined === level) {
            level = -10;
        }

        return protectingUnits
            .filter(protectingUnit => protectingUnit.level >= level)
        ;
    }

    static getHexsAdjacentToKingdom(world, kingdom) {
        const adjacentHexs = [];

        kingdom.hexs.forEach(hex => {
            this
                .neighboursHexs(world, hex)
                .filter(hex => hex.kingdom !== kingdom)
                .forEach(neighboursHex => {
                    if (-1 === adjacentHexs.indexOf(neighboursHex)) {
                        adjacentHexs.push(neighboursHex);
                    }
                })
            ;
        });

        return adjacentHexs;
    }

    static isHexCoastal(world, hex) {
        return this
            .neighbours(hex)
            .map(neighbourCoords => world.getHexAt(neighbourCoords))
            .some(hex => hex === undefined)
        ;
    }

    static createTreeForHex(world, hex) {
        const treeType = this.isHexCoastal(world, hex) ? Tree.COASTAL : Tree.CONTINENTAL;
        const tree = new Tree(treeType);

        tree.hex = hex;

        return tree;
    }
}