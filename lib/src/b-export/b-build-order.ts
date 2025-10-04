import { StringHelpers } from '../string-helpers';

// Categories for the build tool (exported from the game)
export class BuildMenuCategory {
  category: number = 0;
  categoryName: string = '';
  categoryShowName: string = '';
  categoryIcon: string = '';
  categoryIconUrl: string = '';

  public importFrom(original: BuildMenuCategory) {
    this.category = original.category;
    this.categoryName = original.categoryName;
    this.categoryShowName = original.categoryShowName;
    this.categoryIcon = original.categoryIcon;
    this.categoryIconUrl = StringHelpers.createUrl(this.categoryIcon, true);
  }

  // Static
  public static allCategories: BuildMenuCategory;
  public static buildMenuCategories: BuildMenuCategory[];
  public static init() {
    BuildMenuCategory.buildMenuCategories = [];

    BuildMenuCategory.allCategories = new BuildMenuCategory();
    BuildMenuCategory.allCategories.category = -1;
    BuildMenuCategory.allCategories.categoryName = 'All';
    BuildMenuCategory.allCategories.categoryIcon = 'icon_category_base';
    BuildMenuCategory.allCategories.categoryIconUrl = StringHelpers.createUrl(
      BuildMenuCategory.allCategories.categoryIcon,
      true
    );
  }

  public static getCategory(category: number): BuildMenuCategory {
    if (BuildMenuCategory.buildMenuCategories != null)
      for (let buildCategory of BuildMenuCategory.buildMenuCategories)
        if (buildCategory.category == category) return buildCategory;

    throw new Error('BuildMenuCategory.getCategory : Category not found');
  }

  public static load(buildMenuCategories: BuildMenuCategory[]) {
    for (let original of buildMenuCategories) {
      let newBuildMenuCategory = new BuildMenuCategory();
      newBuildMenuCategory.importFrom(original);

      BuildMenuCategory.buildMenuCategories.push(newBuildMenuCategory);
    }
  }
}

// Buildings for the build tool (exported from the game)
export class BuildMenuItem {
  category: number = 0;
  buildingId: string = '';

  public importFrom(original: BuildMenuItem) {
    this.category = original.category;
    this.buildingId = original.buildingId;
  }

  // Static
  public static buildMenuItems: BuildMenuItem[];
  public static init() {
    BuildMenuItem.buildMenuItems = [];
  }

  public static load(buildMenuitems: BuildMenuItem[]) {
    for (let original of buildMenuitems) {
      let newBuildMenuItem = new BuildMenuItem();
      newBuildMenuItem.importFrom(original);

      BuildMenuItem.buildMenuItems.push(newBuildMenuItem);
    }
  }
}
